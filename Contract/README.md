# Holdis Smart Contract

Production-grade blockchain invoice and payment protocol with hybrid on-chain/off-chain architecture.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Technical Specification](#technical-specification)
- [Core Functionality](#core-functionality)
- [Integration Guide](#integration-guide)
- [API Reference](#api-reference)
- [Security Model](#security-model)
- [Deployment](#deployment)
- [Testing](#testing)
- [License](#license)

---

## Overview

Holdis is an invoice and payment protocol that leverages blockchain technology for immutable state tracking while maintaining funds in off-chain custody. The system provides two operational modes: direct payment for instant settlements and escrow mode for deliverable-based transactions.

### Key Characteristics

- **Hybrid Architecture**: On-chain state registry with off-chain fund custody
- **Dual Payment Modes**: Direct payment and escrow-based workflows
- **Multi-Token Support**: Native cryptocurrency and ERC20 tokens
- **Upgradeable Design**: UUPS (Universal Upgradeable Proxy Standard) pattern
- **Event-Driven Integration**: Real-time backend orchestration via contract events
- **Enterprise-Ready**: Role-based access control, pausable operations, and comprehensive audit trails

### Use Cases

- **Freelance Platforms**: Instant payments or milestone-based escrow
- **E-commerce**: Buyer protection with delivery confirmation
- **B2B Invoicing**: Corporate payment workflows with audit trails
- **Service Marketplaces**: Gig economy transaction management
- **International Remittance**: Cross-border payments with verifiable records

---

## Architecture

### System Design

```
┌─────────────────────────────────────────────────────────────┐
│                    Blockchain Layer                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Holdis Smart Contract                      │ │
│  │  - Invoice state registry                              │ │
│  │  - State transition logic                              │ │
│  │  - Event emissions                                     │ │
│  │  - Access control                                      │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Events
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  Orchestration Layer                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Backend Services                           │ │
│  │  - Event listeners                                     │ │
│  │  - Business logic                                      │ │
│  │  - KYC/compliance                                      │ │
│  │  - Notification services                               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ API Calls
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Custody Layer                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Blockradar Wallet Service                      │ │
│  │  - Custodial wallets                                   │ │
│  │  - Fund transfers                                      │ │
│  │  - Multi-token support                                 │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Payment Modes

#### Mode 1: Direct Payment
```
┌─────────┐     ┌─────────┐     ┌───────────┐
│ Invoice │ ──> │  Funded │ ──> │ Completed │
│ Created │     │         │     │           │
└─────────┘     └─────────┘     └───────────┘
                                       ↓
                              Funds Released
```

**Characteristics:**
- Immediate settlement upon payment confirmation
- No deliverable verification required
- Suitable for services, consultations, donations

#### Mode 2: Escrow Payment
```
┌─────────┐     ┌─────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
│ Invoice │ ──> │  Funded │ ──> │ Delivered │ ──> │ Confirmed │ ──> │ Completed │
│ Created │     │         │     │           │     │           │     │           │
└─────────┘     └─────────┘     └───────────┘     └───────────┘     └───────────┘
                     ↓                ↓                  ↓                 ↓
               Funds Held      Proof Submitted    Receiver Verifies  Funds Released
```

**Characteristics:**
- Funds held until deliverable confirmation
- Issuer provides proof of delivery (IPFS hash)
- Receiver must confirm before release
- Suitable for goods, development work, custom services

---

## Technical Specification

### Contract Details

- **Contract Name**: `Holdis`
- **Solidity Version**: `^0.8.28`
- **License**: MIT
- **Upgradeability**: UUPS (ERC-1967)
- **Standards**: OpenZeppelin Upgradeable Contracts

### State Variables

#### Core Storage

```solidity
uint256 private _nextInvoiceId;              // Invoice ID counter
PlatformSettings public platformSettings;     // Global platform configuration
mapping(uint256 => Invoice) public invoices;  // Invoice registry
```

#### Indexing

```solidity
mapping(address => uint256[]) private _issuerInvoices;    // Invoices by creator
mapping(address => uint256[]) private _payerInvoices;     // Invoices by payer
mapping(address => uint256[]) private _receiverInvoices;  // Invoices by receiver
```

#### Token Management

```solidity
mapping(address => bool) public supportedTokens;  // Whitelist of supported tokens
address[] public supportedTokenList;              // Array of supported tokens
```

### Data Structures

#### Invoice

```solidity
struct Invoice {
    uint256 id;                 // Unique identifier
    address issuer;             // Invoice creator
    address payer;              // Payment source
    address receiver;           // Fund recipient
    uint256 amount;             // Invoice amount
    address tokenAddress;       // ERC20 address or address(0) for native
    InvoiceStatus status;       // Current state
    bool requiresDelivery;      // Escrow mode flag
    string description;         // Invoice description
    string attachmentHash;      // IPFS content hash
    uint256 createdAt;          // Creation timestamp
    uint256 fundedAt;           // Funding timestamp
    uint256 deliveredAt;        // Delivery timestamp
    uint256 completedAt;        // Completion timestamp
}
```

#### Status Lifecycle

```solidity
enum InvoiceStatus {
    Pending,      // Initial state, awaiting payment
    Funded,       // Payment received, funds in custody
    Delivered,    // Deliverables submitted (escrow only)
    Completed,    // Transaction finalized, funds released
    Cancelled     // Invoice cancelled
}
```

#### Platform Settings

```solidity
struct PlatformSettings {
    uint256 platformFee;        // Fee in basis points (250 = 2.5%)
    uint256 maxInvoiceAmount;   // Maximum invoice value
    uint256 minInvoiceAmount;   // Minimum invoice value
}
```

### Access Control

#### Roles

```solidity
bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
```

- **ADMIN_ROLE**: Platform administration and configuration management
- **Users**: Permissionless invoice creation (no role required)

#### Function Authorization

| Function | Authorization |
|----------|--------------|
| `createInvoice` | Anyone |
| `markAsFunded` | Payer or Admin |
| `submitDelivery` | Issuer only |
| `confirmDelivery` | Receiver only |
| `cancelInvoice` | Issuer, Payer, or Admin |
| `updatePlatformSettings` | Admin only |
| `setSupportedToken` | Admin only |
| `pause` / `unpause` | Admin only |

---

## Core Functionality

### Invoice Creation

```solidity
function createInvoice(
    address payer,
    address receiver,
    uint256 amount,
    address token,
    bool requiresDelivery,
    string calldata description,
    string calldata attachmentHash
) external whenNotPaused onlySupportedToken(token) returns (uint256 invoiceId)
```

**Parameters:**
- `payer`: Address responsible for payment
- `receiver`: Address receiving funds upon completion
- `amount`: Invoice value in token decimals
- `token`: Token contract address (address(0) for native)
- `requiresDelivery`: Enable escrow mode if true
- `description`: Human-readable invoice description
- `attachmentHash`: IPFS hash for additional documentation

**Returns:** Unique invoice identifier

**Events Emitted:** `InvoiceCreated`

**Example:**

```javascript
// Direct payment mode
const invoiceId = await holdis.write.createInvoice([
  payerAddress,
  receiverAddress,
  parseUnits("1000", 18),
  ZERO_ADDRESS,
  false,
  "Consulting services for Q1 2026",
  "QmXYZ..."
], { account: issuerAccount });

// Escrow mode
const invoiceId = await holdis.write.createInvoice([
  payerAddress,
  receiverAddress,
  parseUnits("5000", 6),  // USDC
  USDC_ADDRESS,
  true,
  "Custom web application development",
  "QmABC..."
], { account: issuerAccount });
```

### Payment Confirmation

```solidity
function markAsFunded(uint256 invoiceId) 
    external 
    whenNotPaused 
    invoiceExists(invoiceId)
    inStatus(invoiceId, InvoiceStatus.Pending)
    nonReentrant
```

**Behavior:**
- **Direct Mode** (`requiresDelivery = false`): Automatically transitions to Completed
- **Escrow Mode** (`requiresDelivery = true`): Transitions to Funded, awaits delivery

**Authorization:** Payer or Admin

**Events Emitted:** `InvoiceFunded`, `InvoiceStatusUpdated`, `InvoiceCompleted` (direct mode)

### Delivery Submission

```solidity
function submitDelivery(
    uint256 invoiceId,
    string calldata proofHash
) external whenNotPaused invoiceExists(invoiceId) inStatus(invoiceId, InvoiceStatus.Funded)
```

**Requirements:**
- Invoice must have `requiresDelivery = true`
- Current status must be Funded
- Caller must be invoice issuer

**Events Emitted:** `DeliverySubmitted`, `InvoiceStatusUpdated`

### Delivery Confirmation

```solidity
function confirmDelivery(uint256 invoiceId)
    external
    whenNotPaused
    invoiceExists(invoiceId)
    inStatus(invoiceId, InvoiceStatus.Delivered)
    nonReentrant
```

**Behavior:**
- Validates deliverable quality
- Triggers fund release flow
- Calculates and emits platform fee

**Authorization:** Receiver only

**Events Emitted:** `DeliveryConfirmed`, `InvoiceCompleted`, `InvoiceStatusUpdated`

### Invoice Cancellation

```solidity
function cancelInvoice(
    uint256 invoiceId,
    string calldata reason
) external whenNotPaused invoiceExists(invoiceId) nonReentrant
```

**Constraints:**
- Only allowed for Pending invoices
- Cannot cancel after funding

**Authorization:** Issuer, Payer, or Admin

**Events Emitted:** `InvoiceCancelled`, `InvoiceStatusUpdated`

---

## Integration Guide

### Backend Event Listening

```javascript
// Initialize contract connection
const holdis = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

// Listen for invoice creation
holdis.on('InvoiceCreated', async (invoiceId, issuer, payer, receiver, amount, token, requiresDelivery, timestamp) => {
  await database.invoices.create({
    id: invoiceId.toString(),
    issuer,
    payer,
    receiver,
    amount: amount.toString(),
    token,
    requiresDelivery,
    createdAt: new Date(timestamp.toNumber() * 1000)
  });
  
  await notificationService.sendInvoiceCreated(payer, invoiceId);
});

// Listen for funding events
holdis.on('InvoiceFunded', async (invoiceId, payer, amount, timestamp) => {
  const invoice = await holdis.getInvoice(invoiceId);
  
  // Hold funds in custody
  await blockradarAPI.holdFunds({
    walletAddress: payer,
    amount: amount.toString(),
    token: invoice.tokenAddress,
    invoiceId: invoiceId.toString()
  });
  
  await database.invoices.update(invoiceId, { status: 'funded' });
});

// Listen for completion events
holdis.on('InvoiceCompleted', async (invoiceId, platformFee, timestamp) => {
  const invoice = await holdis.getInvoice(invoiceId);
  const netAmount = invoice.amount - platformFee;
  
  // Execute fund transfer
  await blockradarAPI.transfer({
    from: invoice.payer,
    to: invoice.receiver,
    amount: netAmount.toString(),
    token: invoice.tokenAddress
  });
  
  // Collect platform fee
  await blockradarAPI.transfer({
    from: invoice.payer,
    to: PLATFORM_WALLET,
    amount: platformFee.toString(),
    token: invoice.tokenAddress
  });
  
  await database.invoices.update(invoiceId, { status: 'completed' });
  await notificationService.sendPaymentCompleted(invoice.receiver, invoiceId);
});
```

### Payment Link Generation

```javascript
async function generatePaymentLink(invoiceId) {
  const invoice = await holdis.getInvoice(invoiceId);
  
  return {
    url: `https://holdis.app/pay/${invoiceId}`,
    qrCode: await generateQRCode(`holdis://pay/${invoiceId}`),
    invoice: {
      id: invoiceId,
      amount: formatUnits(invoice.amount, getTokenDecimals(invoice.tokenAddress)),
      token: getTokenSymbol(invoice.tokenAddress),
      description: invoice.description,
      issuer: invoice.issuer,
      status: getStatusName(invoice.status)
    }
  };
}
```

### Query Examples

```javascript
// Get invoice details
const invoice = await holdis.getInvoice(invoiceId);

// Get user's invoices (paginated)
const [invoiceIds, total] = await holdis.getIssuerInvoices(userAddress, 0, 20);

// Get platform statistics
const totalInvoices = await holdis.getTotalInvoices();
const supportedTokens = await holdis.getSupportedTokens();
const platformSettings = await holdis.platformSettings();
```

---

## API Reference

### Read Functions

#### `getInvoice(uint256 invoiceId)`
Returns complete invoice data structure.

#### `getIssuerInvoices(address issuer, uint256 offset, uint256 limit)`
Returns paginated list of invoices created by address.

#### `getPayerInvoices(address payer, uint256 offset, uint256 limit)`
Returns paginated list of invoices to be paid by address.

#### `getReceiverInvoices(address receiver, uint256 offset, uint256 limit)`
Returns paginated list of invoices receiving funds to address.

#### `getTotalInvoices()`
Returns total number of invoices created.

#### `getSupportedTokens()`
Returns array of supported token addresses.

#### `platformSettings()`
Returns current platform configuration.

### Administrative Functions

#### `updatePlatformSettings(uint256 platformFee, uint256 maxAmount, uint256 minAmount)`
Updates global platform parameters.

**Constraints:**
- `platformFee` ≤ 1000 (10% maximum)
- Requires `ADMIN_ROLE`

#### `setSupportedToken(address token, bool supported)`
Adds or removes token from whitelist.

**Requires:** `ADMIN_ROLE`

#### `pause()` / `unpause()`
Emergency circuit breaker for contract operations.

**Requires:** `ADMIN_ROLE`

### Events

```solidity
event InvoiceCreated(
    uint256 indexed invoiceId,
    address indexed issuer,
    address indexed payer,
    address receiver,
    uint256 amount,
    address token,
    bool requiresDelivery,
    uint256 timestamp
);

event InvoiceFunded(
    uint256 indexed invoiceId,
    address indexed payer,
    uint256 amount,
    uint256 timestamp
);

event DeliverySubmitted(
    uint256 indexed invoiceId,
    address indexed issuer,
    string proofHash,
    uint256 timestamp
);

event DeliveryConfirmed(
    uint256 indexed invoiceId,
    address indexed receiver,
    uint256 timestamp
);

event InvoiceCompleted(
    uint256 indexed invoiceId,
    uint256 platformFeeCollected,
    uint256 timestamp
);

event InvoiceCancelled(
    uint256 indexed invoiceId,
    address indexed cancelledBy,
    string reason,
    uint256 timestamp
);

event InvoiceStatusUpdated(
    uint256 indexed invoiceId,
    InvoiceStatus oldStatus,
    InvoiceStatus newStatus,
    uint256 timestamp
);

event TokenSupported(
    address indexed token,
    bool supported,
    uint256 timestamp
);

event PlatformSettingsUpdated(
    uint256 platformFee,
    uint256 maxAmount,
    uint256 minAmount,
    uint256 timestamp
);
```

---

## Security Model

### Design Principles

1. **Separation of Concerns**: State management on-chain, fund custody off-chain
2. **Defense in Depth**: Multiple layers of validation and access control
3. **Fail-Safe Defaults**: Operations default to most restrictive permissions
4. **Principle of Least Privilege**: Minimal role permissions required

### Security Features

#### Reentrancy Protection
All state-changing functions with external calls protected via `ReentrancyGuardUpgradeable`.

#### Access Control
OpenZeppelin `AccessControlUpgradeable` for role-based permissions with revocable grants.

#### Pausability
Emergency stop mechanism via `PausableUpgradeable` for critical vulnerabilities.

#### Upgradeability
UUPS pattern allows bug fixes while maintaining state and address continuity.

#### Input Validation
- Amount bounds checking (min/max)
- Token whitelist enforcement
- Status transition validation
- Address zero checks

### Audit Considerations

- **No Fund Custody**: Contract holds no tokens, eliminating custody-related attack vectors
- **Immutable Audit Trail**: All state transitions permanently recorded via events
- **Limited Trust Assumptions**: Backend trusted for fund custody; on-chain logic independently verifiable
- **Upgrade Transparency**: Proxy pattern allows verification of implementation changes

### Best Practices for Integrators

1. **Event Monitoring**: Subscribe to all relevant events with redundant listeners
2. **State Reconciliation**: Periodically sync backend state with on-chain data
3. **Transaction Confirmation**: Wait for sufficient block confirmations before fund movements
4. **Error Handling**: Implement robust retry logic for failed transactions
5. **Rate Limiting**: Implement backend rate limits to prevent spam attacks

---

## Deployment

### Prerequisites

```bash
node >= 18.0.0
npm >= 9.0.0
hardhat >= 3.0.0
```

### Installation

```bash
npm install
```

### Compilation

```bash
npx hardhat compile
```

### Local Testing

```bash
# Run test suite
npx hardhat test

# Run with gas reporting
REPORT_GAS=true npx hardhat test

# Run specific test file
npx hardhat test test/Holdis.test.ts
```

### Network Deployment

```bash
# Deploy to testnet
npx hardhat ignition deploy ignition/modules/Holdis.ts --network goerli

# Deploy to mainnet
npx hardhat ignition deploy ignition/modules/Holdis.ts --network mainnet
```

### Contract Verification

```bash
npx hardhat verify --network <network> <contract-address> <constructor-args>
```

### Environment Configuration

Create `.env` file:

```env
# RPC URLs
MAINNET_RPC_URL=
GOERLI_RPC_URL=
SEPOLIA_RPC_URL=

# Private Keys (never commit!)
DEPLOYER_PRIVATE_KEY=
ADMIN_PRIVATE_KEY=

# Etherscan
ETHERSCAN_API_KEY=

# Platform Configuration
PLATFORM_FEE=250
MAX_INVOICE_AMOUNT=1000000000000000000000000
MIN_INVOICE_AMOUNT=1000000000000000000
```

---

## Testing

### Test Coverage

```bash
npx hardhat coverage
```

### Test Suite Structure

```
test/
└── Holdis.test.ts
    ├── Deployment & Initialization (3 tests)
    ├── Direct Payment Mode (1 test)
    ├── Escrow Mode (2 tests)
    ├── Invoice Cancellation (2 tests)
    ├── Query Functions (2 tests)
    ├── Admin Functions (3 tests)
    ├── Access Control (3 tests)
    └── Event Emissions (2 tests)
```

### Running Tests

```bash
# All tests
npx hardhat test

# With gas reporting
REPORT_GAS=true npx hardhat test

# Specific test file
npx hardhat test test/Holdis.test.ts

# Watch mode
npx hardhat test --watch
```

---

