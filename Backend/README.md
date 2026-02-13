# Holdis Backend

Production-grade backend orchestration layer for the Holdis invoice and payment protocol.

## Architecture

The backend serves as the orchestration layer between the Holdis smart contract (on-chain state registry) and Blockradar (off-chain fund custody).

```
┌─────────────────────────────────────────────────────────────┐
│                    Smart Contract                            │
│  - State management                                          │
│  - Event emissions                                           │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   │ Contract Events
                   ↓
┌─────────────────────────────────────────────────────────────┐
│                    Backend Services                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Event Listener Service                              │   │
│  │  - Watches blockchain for contract events            │   │
│  │  - Orchestrates fund movements                       │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Contract Service                                    │   │
│  │  - Reads contract state                             │   │
│  │  - Query invoice data                                │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Blockradar Service                                  │   │
│  │  - Wallet management                                 │   │
│  │  - Fund transfers                                    │   │
│  │  - Custody operations                                │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   │ API Calls
                   ↓
┌─────────────────────────────────────────────────────────────┐
│                    Blockradar API                            │
│  - Custodial wallets                                         │
│  - Multi-token transfers                                     │
│  - Smart contract interactions                               │
└─────────────────────────────────────────────────────────────┘
```

## Core Services

### 1. Event Listener Service (`event-listener.service.ts`)

Monitors blockchain for Holdis contract events and orchestrates fund movements.

**Responsibilities:**
- Watch for contract events (InvoiceCreated, InvoiceFunded, InvoiceCompleted, etc.)
- Trigger fund custody operations via Blockradar
- Maintain sync between on-chain state and off-chain funds
- Handle edge cases (refunds, cancellations)

**Key Events Handled:**

| Event | Action |
|-------|--------|
| `InvoiceCreated` | Log invoice creation, send notifications |
| `InvoiceFunded` | Record funds in custody |
| `DeliverySubmitted` | Notify receiver to confirm |
| `DeliveryConfirmed` | Prepare for fund release |
| `InvoiceCompleted` | **Execute fund transfer** (receiver + platform fee) |
| `InvoiceCancelled` | Process refunds if applicable |

### 2. Blockradar Service (`blockradar.service.ts`)

Manages all interactions with Blockradar's custodial wallet infrastructure.

**Capabilities:**
- Wallet balance queries
- Token transfers (native + ERC20)
- Smart contract read/write operations
- Network fee estimation
- Transaction status tracking
- Custody operations (hold/release funds)

**Integration with Blockradar API:**
```typescript
// Read contract state
await blockradarService.readContract({ ... });

// Transfer funds
await blockradarService.transfer({
  to: receiverAddress,
  amount: '1000000000000000000',
  token: usdcAddress
});

// Release funds from custody
await blockradarService.releaseFunds({
  invoiceId: '123',
  toAddress: receiver,
  amount: '1000',
  token: tokenAddress,
  platformFee: '25'
});
```

### 3. Contract Service (`contract.service.ts`)

Provides interface to read Holdis smart contract state.

**Functions:**
- Query invoice details
- Get invoices by role (issuer/payer/receiver)
- Check platform settings
- Validate token support
- Monitor blockchain state

```typescript
// Get invoice from blockchain
const invoice = await contractService.getInvoice(invoiceId);

// Get user's invoices
const { invoiceIds, total } = await contractService.getIssuerInvoices(
  userAddress, 
  offset, 
  limit
);

// Get platform settings
const settings = await contractService.getPlatformSettings();
```

## Project Structure

```
Backend/
├── src/
│   ├── config/
│   │   └── env.ts                    # Environment configuration with validation
│   ├── services/
│   │   ├── blockradar.service.ts     # Blockradar API integration
│   │   ├── contract.service.ts       # Smart contract interactions
│   │   └── event-listener.service.ts # Event monitoring & orchestration
│   ├── controllers/
│   │   └── (API route handlers)
│   ├── models/
│   │   └── (Database models)
│   ├── types/
│   │   ├── contract.ts               # Contract types & interfaces
│   │   └── blockradar.ts             # Blockradar types
│   ├── utils/
│   │   └── logger.ts                 # Winston logger configuration
│   ├── middlewares/
│   │   └── (Express middlewares)
│   ├── events/
│   │   └── (Event handlers)
│   └── index.ts                      # Application entry point
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Blockchain**: Viem (Ethereum interaction)
- **HTTP Client**: Axios
- **Logging**: Winston
- **Validation**: Zod
- **Environment**: dotenv

## Setup

### Prerequisites

```bash
node >= 18.0.0
npm >= 9.0.0
```

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Configure environment variables
nano .env
```

### Environment Variables

```env
# Blockchain
ETHEREUM_RPC_URL=           # Alchemy/Infura RPC endpoint
CHAIN_ID=1                  # 1 = Mainnet, 11155111 = Sepolia
CONTRACT_ADDRESS=           # Deployed Holdis contract address

# Blockradar
BLOCKRADAR_API_KEY=         # API key from Blockradar dashboard
BLOCKRADAR_WALLET_ID=       # Master wallet ID
BLOCKRADAR_WEBHOOK_SECRET=  # Webhook verification secret

# Platform
PLATFORM_WALLET_ADDRESS=    # Address for collecting platform fees
PLATFORM_FEE_BASIS_POINTS=250  # 2.5%

# Database
DATABASE_URL=               # PostgreSQL connection string

# Redis
REDIS_URL=                  # Redis for caching/queues

# Security
JWT_SECRET=                 # Minimum 32 characters
ENCRYPTION_KEY=             # Minimum 32 characters
```

### Development

```bash
# Start development server with hot reload
npm run dev

# Type check
npm run typecheck

# Lint
npm run lint

# Run tests
npm test
```

### Production

```bash
# Build TypeScript
npm run build

# Run production server
npm run start:prod
```

## Key Workflows

### Direct Payment Flow

```
1. User creates invoice (requiresDelivery: false)
   ↓
2. Smart contract emits InvoiceCreated event
   ↓
3. Backend logs invoice creation
   ↓
4. Payer pays via Blockradar wallet
   ↓
5. Smart contract emits InvoiceFunded event
   ↓
6. Backend records funds in custody
   ↓
7. Smart contract auto-completes (emits InvoiceCompleted)
   ↓
8. Backend executes transfer:
   - Receiver gets: amount - platformFee
   - Platform gets: platformFee
```

### Escrow Payment Flow

```
1. User creates invoice (requiresDelivery: true)
   ↓
2. Smart contract emits InvoiceCreated event
   ↓
3. Payer pays via Blockradar wallet
   ↓
4. Smart contract emits InvoiceFunded event
   ↓
5. Backend holds funds in custody
   ↓
6. Issuer submits delivery proof
   ↓
7. Smart contract emits DeliverySubmitted event
   ↓
8. Backend notifies receiver to confirm
   ↓
9. Receiver confirms delivery
   ↓
10. Smart contract emits InvoiceCompleted event
    ↓
11. Backend executes transfer:
    - Receiver gets: amount - platformFee
    - Platform gets: platformFee
```

## Blockradar Integration

### Wallet Structure

The backend uses Blockradar's master wallet for platform operations:

- **Master Wallet**: Platform treasury and fee collection
- **Child Addresses**: User-specific wallets (future feature)

### Smart Contract Operations via Blockradar

Blockradar allows interacting with smart contracts without managing private keys:

```typescript
// Read contract (no gas required)
const invoice = await blockradarService.readContract({
  address: CONTRACT_ADDRESS,
  method: 'getInvoice',
  parameters: [invoiceId],
  abi: [...]
});

// Write contract (gas fees handled by Blockradar)
const tx = await blockradarService.writeContract({
  address: CONTRACT_ADDRESS,
  method: 'markAsFunded',
  parameters: [invoiceId],
  abi: [...],
  reference: `invoice-${invoiceId}-funding`
});
```

### Webhook Handling

Blockradar sends webhooks for transaction confirmations:

```typescript
POST /webhooks/blockradar
{
  "event": "custom-smart-contract.success",
  "data": {
    "id": "tx-uuid",
    "hash": "0x...",
    "status": "SUCCESS",
    "method": "markAsFunded",
    "reference": "invoice-123-funding"
  }
}
```

## Error Handling

### Retry Strategy

Failed operations are retried with exponential backoff:

1. First retry: 2 seconds
2. Second retry: 4 seconds
3. Third retry: 8 seconds
4. Max attempts: 5
5. After max attempts: Alert admin

### Critical Failures

For fund transfer failures:
1. Log error with full context
2. Create manual review ticket
3. Alert on-call engineer
4. Freeze related invoices
5. Prevent data inconsistency

## Monitoring

### Metrics to Track

- Event processing latency
- Fund transfer success rate
- API response times
- Blockchain sync status
- Blockradar API health

### Logging

All operations are logged with structured logging:

```typescript
logger.info('Invoice completed', {
  invoiceId: '123',
  amount: '1000',
  receiver: '0x...',
  txHash: '0x...'
});
```

Log levels:
- `error`: Critical failures
- `warn`: Degraded performance
- `info`: Normal operations
- `debug`: Detailed debugging (development only)

## Security

### API Key Management

- Store Blockradar API key in environment variables
- Never commit `.env` file
- Rotate keys quarterly
- Use separate keys for dev/staging/production

### Webhook Verification

Verify Blockradar webhook signatures:

```typescript
const signature = req.headers['x-blockradar-signature'];
const isValid = verifyWebhookSignature(
  req.body,
  signature,
  BLOCKRADAR_WEBHOOK_SECRET
);
```

### Data Encryption

Sensitive data encrypted at rest:
- User KYC information
- Payment metadata
- Internal references

## Testing

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# End-to-end tests
npm run test:e2e
```

## Deployment

### Docker

```bash
# Build image
docker build -t holdis-backend .

# Run container
docker run -p 3000:3000 --env-file .env holdis-backend
```

### Environment-Specific Configuration

| Environment | RPC | Blockradar | Database |
|-------------|-----|------------|----------|
| Development | Sepolia testnet | Test API keys | Local PostgreSQL |
| Staging | Sepolia testnet | Test API keys | Cloud PostgreSQL |
| Production | Mainnet | Production keys | Cloud PostgreSQL |

## Future Enhancements

- [ ] Child address support for user-specific wallets
- [ ] Advanced dispute resolution workflow
- [ ] Automated KYC verification integration
- [ ] Multi-signature invoice approvals
- [ ] Scheduled/recurring payments automation
- [ ] Analytics dashboard
- [ ] Rate limiting & DDoS protection
- [ ] GraphQL API layer

## Support

For issues or questions:
- Documentation: [docs.holdis.app](https://docs.holdis.app)
- GitHub Issues: [github.com/holdis/backend/issues](https://github.com/holdis/backend/issues)

## License

MIT License - see [LICENSE](../LICENSE) file for details
