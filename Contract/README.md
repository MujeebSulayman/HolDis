# Holdis Smart Contract - Invoice & Payment System

## Overview

A lean, production-ready smart contract for blockchain-based invoice and payment tracking. The contract acts as an **immutable state registry** while funds remain in **off-chain custody** (Blockradar wallets).

---

## 🎯 Two Operating Modes

### Mode 1: Direct Payment (Simple)
```plaintext
Create Invoice → Pay → ✅ Auto-Complete
```
**Use Case:** Simple payments, no deliverables needed
- Freelancer gets paid for consultation
- Instant payment release after funding

### Mode 2: Escrow Mode (Deliverables)
```plaintext
Create Invoice → Pay → Submit Delivery → Confirm → ✅ Complete
```
**Use Case:** Service contracts with deliverables
- Web development: payment held until site is delivered
- Graphic design: funds released after client confirms designs

---

## 📊 Contract Structure

### Invoice States
```solidity
enum InvoiceStatus {
    Pending,      // Created, awaiting payment
    Funded,       // Paid (funds in custody)
    Delivered,    // (Escrow only) Deliverables submitted
    Completed,    // Funds released
    Cancelled     // Cancelled before payment
}
```

### Invoice Data
```solidity
struct Invoice {
    uint256 id;
    address issuer;           // Who created the invoice
    address payer;            // Who pays
    address receiver;         // Who receives the funds
    uint256 amount;
    address tokenAddress;     // ERC20 or address(0) for native
    InvoiceStatus status;
    bool requiresDelivery;    // Escrow mode flag
    string description;
    string attachmentHash;    // IPFS hash
    uint256 createdAt;
    uint256 fundedAt;
    uint256 deliveredAt;
    uint256 completedAt;
}
```

### Platform Settings
```solidity
struct PlatformSettings {
    uint256 platformFee;        // Basis points (250 = 2.5%)
    uint256 maxInvoiceAmount;
    uint256 minInvoiceAmount;
}
```

---

## 🔑 Core Functions

### Create Invoice
```solidity
function createInvoice(
    address payer,
    address receiver,
    uint256 amount,
    address token,
    bool requiresDelivery,  // false = direct payment, true = escrow
    string calldata description,
    string calldata attachmentHash
) external returns (uint256 invoiceId)
```

**Example: Direct Payment**
```javascript
await holdis.write.createInvoice([
  payerAddress,
  receiverAddress,
  parseUnits("1000", 18),
  "0x0000000000000000000000000000000000000000", // Native token
  false,  // No delivery required
  "Consulting services",
  "QmXYZ..."
]);
```

**Example: Escrow Mode**
```javascript
await holdis.write.createInvoice([
  payerAddress,
  receiverAddress,
  parseUnits("5000", 18),
  usdcAddress,
  true,  // Requires delivery
  "Website development",
  "QmABC..."
]);
```

### Mark as Funded
```solidity
function markAsFunded(uint256 invoiceId) external
```
- Called by **payer** or **admin** after payment confirmed in Blockradar
- If `requiresDelivery = false`, **auto-completes** immediately
- If `requiresDelivery = true`, moves to **Funded** state

### Submit Delivery (Escrow Only)
```solidity
function submitDelivery(uint256 invoiceId, string calldata proofHash) external
```
- Only callable by **issuer**
- Only works if `requiresDelivery = true`
- Moves status to **Delivered**

### Confirm Delivery (Escrow Only)
```solidity
function confirmDelivery(uint256 invoiceId) external
```
- Only callable by **receiver**
- Completes invoice and triggers fund release
- Emits platform fee calculation

### Cancel Invoice
```solidity
function cancelInvoice(uint256 invoiceId, string calldata reason) external
```
- Callable by **issuer**, **payer**, or **admin**
- Only works on **Pending** invoices

---

## 🎪 Real-World Examples

### Example 1: Freelance Payment (Direct Mode)

```javascript
// Alice (freelancer) creates invoice for Bob (client)
const invoiceId = await holdis.write.createInvoice([
  bobAddress,          // payer
  aliceAddress,        // receiver
  parseUnits("500", 18),
  nativeToken,
  false,               // Direct payment, no delivery
  "Logo design consultation",
  "Qm..."
]);

// Bob pays via Blockradar
// Backend calls:
await holdis.write.markAsFunded([invoiceId], { account: bob });

// ✅ Auto-completed! Funds released to Alice immediately
```

### Example 2: E-commerce with Escrow

```javascript
// Seller creates invoice
const invoiceId = await holdis.write.createInvoice([
  buyerAddress,
  sellerAddress,
  parseUnits("200", 6),  // 200 USDC
  usdcAddress,
  true,                  // Requires delivery confirmation
  "Custom sneakers",
  "Qm..."
]);

// Buyer pays
await holdis.write.markAsFunded([invoiceId], { account: buyer });
// Status: Funded (funds held in escrow)

// Seller ships and provides tracking
await holdis.write.submitDelivery([invoiceId, "QmTracking123"], { account: seller });
// Status: Delivered

// Buyer receives and confirms
await holdis.write.confirmDelivery([invoiceId], { account: buyer });
// Status: Completed ✅
// Platform fee: 2.5% = 5 USDC
// Seller receives: 195 USDC
```

---

## 🔐 Access Control

### Roles
- **ADMIN_ROLE**: Platform owner (update settings, pause, manage tokens)
- **Users**: Anyone can create invoices

### Permissions
| Function | Who Can Call |
|----------|-------------|
| `createInvoice` | Anyone |
| `markAsFunded` | Payer or Admin |
| `submitDelivery` | Issuer only |
| `confirmDelivery` | Receiver only |
| `cancelInvoice` | Issuer, Payer, or Admin |
| `updatePlatformSettings` | Admin only |
| `pause/unpause` | Admin only |

---

## 🛠️ Admin Functions

### Update Platform Settings
```solidity
function updatePlatformSettings(
    uint256 platformFee,
    uint256 maxAmount,
    uint256 minAmount
) external onlyRole(ADMIN_ROLE)
```

### Manage Supported Tokens
```solidity
function setSupportedToken(address token, bool supported) external onlyRole(ADMIN_ROLE)
```

### Emergency Pause
```solidity
function pause() external onlyRole(ADMIN_ROLE)
function unpause() external onlyRole(ADMIN_ROLE)
```

---

## 📈 Query Functions

```solidity
// Get invoice details
function getInvoice(uint256 invoiceId) external view returns (Invoice memory)

// Get invoices by role (with pagination)
function getIssuerInvoices(address issuer, uint256 offset, uint256 limit) 
    external view returns (uint256[] memory, uint256 total)

function getPayerInvoices(address payer, uint256 offset, uint256 limit) 
    external view returns (uint256[] memory, uint256 total)

function getReceiverInvoices(address receiver, uint256 offset, uint256 limit) 
    external view returns (uint256[] memory, uint256 total)

// Platform stats
function getTotalInvoices() external view returns (uint256)
function getSupportedTokens() external view returns (address[] memory)
```

---

## 🎯 Key Events

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
```

---

## 🚀 Backend Integration

Your backend should:

1. **Listen to events**
```javascript
// On InvoiceFunded event
backend.on('InvoiceFunded', async (invoiceId, payer, amount) => {
  // Hold funds in Blockradar custody wallet
  await blockradar.holdFunds(payer, amount);
});

// On InvoiceCompleted event
backend.on('InvoiceCompleted', async (invoiceId, platformFee) => {
  const invoice = await contract.getInvoice(invoiceId);
  
  // Transfer funds
  await blockradar.transfer({
    from: invoice.payer,
    to: invoice.receiver,
    amount: invoice.amount - platformFee
  });
  
  // Collect platform fee
  await blockradar.transfer({
    from: invoice.payer,
    to: platformWallet,
    amount: platformFee
  });
});
```

2. **Handle disputes** (off-chain logic)
3. **Manage KYC** (off-chain verification)
4. **Generate payment links** (invoice ID → unique URL)

---

## 🔥 Features

✅ **Upgradeable** (UUPS pattern)  
✅ **Two payment modes** (direct & escrow)  
✅ **Multi-token support** (native + ERC20)  
✅ **Platform fee system** (basis points)  
✅ **Pausable** (emergency stop)  
✅ **Event-driven** (backend orchestration)  
✅ **Access control** (role-based permissions)  
✅ **Pagination** (scalable queries)  
✅ **IPFS integration** (attachments & proofs)  

---

## ❌ What Was Removed

- ❌ Disputes (backend handles)
- ❌ KYC (backend handles)
- ❌ Recurring invoices
- ❌ Partial payments
- ❌ Late fees / early discounts
- ❌ Complex payment terms
- ❌ Multiple operator roles

**Why?** Keeps the contract lean, gas-efficient, and easier to audit. Backend can handle business logic flexibly.

---

## 📦 Deployment

```bash
# Compile
npx hardhat compile

# Test
npx hardhat test

# Deploy (using Hardhat Ignition)
npx hardhat ignition deploy ignition/modules/InvoiceEscrowProduction.ts --network <network>

# Verify
npx hardhat verify --network <network> <deployed-address>
```

---

## 🔒 Security

- Uses OpenZeppelin upgradeable contracts
- ReentrancyGuard on state-changing functions
- Role-based access control
- Pausable for emergency situations
- No on-chain fund custody (reduces attack surface)

---

## 📝 License

MIT
