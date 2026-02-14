# Holdis Backend

Backend service that powers the Holdis invoice and payment platform.

## What This Does

The backend connects your users to the blockchain and manages payments through Blockradar's wallet infrastructure. Think of it as the bridge between your users and the smart contract - handling authentication, orchestrating payments, and keeping everything in sync.

## Key Features

**User Management**
- Register users and automatically create blockchain wallets
- Secure login with JWT tokens
- Profile and wallet balance tracking

**Invoice System**
- Create invoices with metadata
- Support for direct payments and escrow (delivery confirmation)
- Track invoice status in real-time

**Payment Processing**
- Funds held in Blockradar custodial wallets
- Support for native tokens and ERC20
- Automatic fund release when conditions are met

**Smart Contract Integration**
- Listens to blockchain events
- Syncs on-chain invoice state
- Manages platform fees and transfers

**Gas Management**
- Automatic gas fee estimation
- Balance monitoring and alerts
- Handles all blockchain transaction fees

## Quick Start

```bash
# Install
npm install

# Setup environment
cp .env.example .env
# Add your API keys to .env

# Run
npm run dev
```

Server starts at `http://localhost:3000`

API documentation at `http://localhost:3000/api-docs`

## What You Need

**Blockradar Account**
Get API credentials at https://dashboard.blockradar.co

**Smart Contract**
Deploy the Holdis contract (see `Contract/` folder)

**Base Network RPC**
Default: https://mainnet.base.org (or use Base Sepolia testnet)

## Environment Setup

Copy `.env.example` to `.env` and fill in:

```env
# Your deployed contract address
HOLDIS_CONTRACT_ADDRESS=0x...

# Blockradar credentials
BLOCKRADAR_API_KEY=your_key
BLOCKRADAR_WALLET_ID=your_wallet_id
BLOCKRADAR_WEBHOOK_SECRET=your_secret

# Security (generate random 32+ character strings)
JWT_SECRET=your_random_string

# Base Network
RPC_URL=https://mainnet.base.org
CHAIN_ID=8453
```

## How It Works

```
User → Backend API → Blockradar Wallets
                  ↓
            Smart Contract (Base Network)
                  ↓
            Blockchain Events → Backend
```

1. Users register and get a blockchain wallet
2. Users create invoices through the API
3. Payments go through Blockradar wallets
4. Backend syncs everything with the smart contract
5. Platform automatically handles gas fees and fund transfers

## API Endpoints

**User Management**
- `POST /api/users/register` - Create account
- `POST /api/users/login` - Get auth token
- `GET /api/users/:userId/profile` - View profile

**Invoices**
- `POST /api/invoices/create` - Create invoice
- `POST /api/invoices/:id/fund` - Pay invoice
- `POST /api/invoices/:id/deliver` - Submit delivery proof
- `POST /api/invoices/:id/confirm` - Confirm delivery
- `GET /api/invoices/user/:userId` - List user invoices

**Webhooks**
- `POST /api/webhooks/blockradar` - Blockradar events

Test everything at `/api-docs` (Swagger UI)

## Project Structure

```
Backend/
├── src/
│   ├── controllers/     # API endpoint handlers
│   ├── services/        # Business logic
│   ├── routes/          # API routes
│   ├── middlewares/     # Auth & validation
│   ├── config/          # Settings & env
│   └── types/           # TypeScript types
├── .env                 # Your secrets (don't commit)
└── package.json
```

## Documentation

- **[AUTHENTICATION.md](./AUTHENTICATION.md)** - How auth works
- **[GAS_MANAGEMENT.md](./GAS_MANAGEMENT.md)** - Gas fee handling
- **[USER_WALLETS.md](./USER_WALLETS.md)** - Wallet architecture

## Development

```bash
npm run dev          # Start with auto-reload
npm run build        # Build for production
npm run start:prod   # Run production build
npm test             # Run tests
```

## Production Checklist

- [ ] Set strong `JWT_SECRET` (32+ characters)
- [ ] Use production Blockradar API key
- [ ] Deploy smart contract to Base mainnet
- [ ] Set contract address in `.env`
- [ ] Configure webhook URL in Blockradar dashboard
- [ ] Enable HTTPS
- [ ] Set up database (currently uses in-memory storage)
- [ ] Configure monitoring and alerts

## Tech Stack

- Node.js + TypeScript
- Express (REST API)
- JWT (authentication)
- Viem (blockchain)
- Blockradar (wallets)
- Swagger (API docs)

## Support

**Blockradar Issues:** https://docs.blockradar.co  
**Smart Contract:** See `Contract/README.md`

## Current Limitations

- **Storage:** User data is in-memory (resets on restart). For production, add PostgreSQL/Prisma.
- **Refresh Tokens:** Only access tokens implemented. Add refresh flow for production.
- **Rate Limiting:** Basic implementation. Enhance for production traffic.
- **Admin Management:** Admin role exists but no admin panel yet.
