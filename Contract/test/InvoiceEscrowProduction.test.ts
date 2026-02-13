import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import { network } from "hardhat";
import { parseUnits, getAddress, Address } from "viem";

describe("InvoiceEscrow - Production Features", () => {
  // Helper to get fresh contract for each test
  async function deployContract() {
    const { viem } = await network.connect();
    const [admin, issuer, payer, receiver, operator, arbiter, other] = await viem.getWalletClients();
    const invoiceEscrow = await viem.deployContract("InvoiceEscrow");
    await invoiceEscrow.write.initialize([admin.account.address]);
    const publicClient = await viem.getPublicClient();
    
    return {
      viem,
      invoiceEscrow,
      admin,
      issuer,
      payer,
      receiver,
      operator,
      arbiter,
      other,
      publicClient,
    };
  }
  
  // Helper to create a basic invoice with payment terms
  async function createBasicInvoice(
    contract: any,
    issuer: any,
    payer: Address,
    receiver: Address,
    amount: bigint,
    token: Address,
    publicClient: any
  ) {
    const terms = {
      dueDate: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30), // 30 days
      lateFeePerDay: 100n, // 1%
      earlyPaymentDiscount: 200n, // 2%
      earlyPaymentDeadline: BigInt(Math.floor(Date.now() / 1000) + 86400 * 7), // 7 days
      allowPartialPayment: true,
      minimumPartialAmount: parseUnits("100", 18), // Must use 18 decimals
    };
    
    const metadata = {
      description: "Test invoice",
      category: "services",
      attachmentHash: "QmTest123",
      termsHash: "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
    };
    
    const hash = await contract.write.createInvoice(
      [payer, receiver, amount, token, terms, metadata, false, 0n],
      { account: issuer.account }
    );
    
    await publicClient.waitForTransactionReceipt({ hash });
  }
  
  describe("Deployment & Initialization", () => {
    it("Should initialize with correct admin roles", async () => {
      const { invoiceEscrow, admin } = await deployContract();
      
      const ADMIN_ROLE = await invoiceEscrow.read.ADMIN_ROLE();
      const OPERATOR_ROLE = await invoiceEscrow.read.OPERATOR_ROLE();
      const ARBITER_ROLE = await invoiceEscrow.read.ARBITER_ROLE();
      
      assert.equal(await invoiceEscrow.read.hasRole([ADMIN_ROLE, admin.account.address]), true);
      assert.equal(await invoiceEscrow.read.hasRole([OPERATOR_ROLE, admin.account.address]), true);
      assert.equal(await invoiceEscrow.read.hasRole([ARBITER_ROLE, admin.account.address]), true);
    });
    
    it("Should initialize with default platform settings", async () => {
      const { invoiceEscrow } = await deployContract();
      
      const settings = await invoiceEscrow.read.platformSettings();
      assert.equal(settings[0], 250n); // platformFee: 2.5%
      assert.equal(settings[1], parseUnits("1000000", 18)); // maxInvoiceAmount
      assert.equal(settings[2], parseUnits("1", 18)); // minInvoiceAmount
    });
    
    it("Should support native token by default", async () => {
      const { invoiceEscrow } = await deployContract();
      
      const isSupported = await invoiceEscrow.read.supportedTokens([getAddress("0x0000000000000000000000000000000000000000")]);
      assert.equal(isSupported, true);
    });
  });
  
  describe("Invoice Creation with Payment Terms", () => {
    it("Should create invoice with full payment terms", async () => {
      const { invoiceEscrow, issuer, payer, receiver, publicClient } = await deployContract();
      
      const amount = parseUnits("1000", 18); // Use 18 decimals for native token
      const token = getAddress("0x0000000000000000000000000000000000000000");
      
      await createBasicInvoice(invoiceEscrow, issuer, payer.account.address, receiver.account.address, amount, token, publicClient);
      
      const agreement: any = await invoiceEscrow.read.getAgreement([1n]);
      
      assert.equal(agreement.totalAmount, amount);
      assert.equal(agreement.tokenAddress.toLowerCase(), token.toLowerCase());
      assert.equal(agreement.status, 1); // Pending
      assert.equal(agreement.terms.allowPartialPayment, true);
    });
    
    it("Should reject invoice below minimum amount", async () => {
      const { invoiceEscrow, issuer, payer, receiver } = await deployContract();
      
      const amount = parseUnits("0.5", 18); // Below minimum
      const token = getAddress("0x0000000000000000000000000000000000000000");
      
      const terms = {
        dueDate: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
        lateFeePerDay: 0n,
        earlyPaymentDiscount: 0n,
        earlyPaymentDeadline: 0n,
        allowPartialPayment: false,
        minimumPartialAmount: 0n,
      };
      
      const metadata = {
        description: "Test",
        category: "test",
        attachmentHash: "",
        termsHash: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
      };
      
      await assert.rejects(
        async () => {
          await invoiceEscrow.write.createInvoice(
            [payer.account.address, receiver.account.address, amount, token, terms, metadata, false, 0n],
            { account: issuer.account }
          );
        },
        /Amount below minimum/
      );
    });
    
    it("Should reject unsupported token", async () => {
      const { invoiceEscrow, issuer, payer, receiver } = await deployContract();
      
      const amount = parseUnits("1000", 6);
      const unsupportedToken = getAddress("0x0000000000000000000000000000000000000001");
      
      const terms = {
        dueDate: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
        lateFeePerDay: 0n,
        earlyPaymentDiscount: 0n,
        earlyPaymentDeadline: 0n,
        allowPartialPayment: false,
        minimumPartialAmount: 0n,
      };
      
      const metadata = {
        description: "Test",
        category: "test",
        attachmentHash: "",
        termsHash: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
      };
      
      await assert.rejects(
        async () => {
          await invoiceEscrow.write.createInvoice(
            [payer.account.address, receiver.account.address, amount, unsupportedToken, terms, metadata, false, 0n],
            { account: issuer.account }
          );
        },
        /Token not supported/
      );
    });
  });
  
  describe("Full Invoice Lifecycle", () => {
    it("Should complete full flow: Pending → Funded → Delivered → Completed", async () => {
      const { invoiceEscrow, issuer, payer, receiver, publicClient } = await deployContract();
      
      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");
      
      // Create invoice
      await createBasicInvoice(invoiceEscrow, issuer, payer.account.address, receiver.account.address, amount, token, publicClient);
      
      let agreement: any = await invoiceEscrow.read.getAgreement([1n]);
      assert.equal(agreement.status, 1); // Pending
      
      // Fund invoice
      let hash = await invoiceEscrow.write.markAsFunded([1n, amount], { account: payer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      agreement = await invoiceEscrow.read.getAgreement([1n]);
      assert.equal(agreement.status, 3); // Funded
      assert.equal(agreement.paidAmount, amount);
      
      // Submit delivery
      hash = await invoiceEscrow.write.submitDelivery([1n, "ipfs://proof"], { account: issuer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      agreement = await invoiceEscrow.read.getAgreement([1n]);
      assert.equal(agreement.status, 4); // Delivered
      
      // Confirm delivery
      hash = await invoiceEscrow.write.confirmDelivery([1n], { account: receiver.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      agreement = await invoiceEscrow.read.getAgreement([1n]);
      assert.equal(agreement.status, 6); // Completed
      assert.ok(agreement.completedAt > 0n);
    });
  });
  
  describe("Partial Payments", () => {
    it("Should handle partial payments correctly", async () => {
      const { invoiceEscrow, issuer, payer, receiver, publicClient } = await deployContract();
      
      const totalAmount = parseUnits("1000", 18);
      const firstPayment = parseUnits("400", 18);
      const secondPayment = parseUnits("600", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");
      
      // Create invoice with partial payments allowed
      await createBasicInvoice(invoiceEscrow, issuer, payer.account.address, receiver.account.address, totalAmount, token, publicClient);
      
      // First partial payment
      let hash = await invoiceEscrow.write.markAsFunded([1n, firstPayment], { account: payer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      let agreement: any = await invoiceEscrow.read.getAgreement([1n]);
      assert.equal(agreement.status, 2); // PartiallyPaid
      assert.equal(agreement.paidAmount, firstPayment);
      
      // Second payment (completes)
      hash = await invoiceEscrow.write.markAsFunded([1n, secondPayment], { account: payer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      agreement = await invoiceEscrow.read.getAgreement([1n]);
      assert.equal(agreement.status, 3); // Funded
      assert.equal(agreement.paidAmount, totalAmount);
    });
    
    it("Should reject partial payment below minimum", async () => {
      const { invoiceEscrow, issuer, payer, receiver, publicClient } = await deployContract();
      
      const totalAmount = parseUnits("1000", 18);
      const smallPayment = parseUnits("50", 18); // Below minimum of 100
      const token = getAddress("0x0000000000000000000000000000000000000000");
      
      await createBasicInvoice(invoiceEscrow, issuer, payer.account.address, receiver.account.address, totalAmount, token, publicClient);
      
      await assert.rejects(
        async () => {
          await invoiceEscrow.write.markAsFunded([1n, smallPayment], { account: payer.account });
        },
        /Below minimum partial amount/
      );
    });
  });
  
  describe("Recurring Invoices", () => {
    it("Should store recurring invoice configuration", async () => {
      const { invoiceEscrow, issuer, payer, receiver, publicClient } = await deployContract();
      
      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");
      const interval = 86400n * 30n; // 30 days
      
      const terms = {
        dueDate: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
        lateFeePerDay: 0n,
        earlyPaymentDiscount: 0n,
        earlyPaymentDeadline: 0n,
        allowPartialPayment: false,
        minimumPartialAmount: 0n,
      };
      
      const metadata = {
        description: "Monthly subscription",
        category: "subscription",
        attachmentHash: "",
        termsHash: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
      };
      
      // Create recurring invoice
      const hash = await invoiceEscrow.write.createInvoice(
        [payer.account.address, receiver.account.address, amount, token, terms, metadata, true, interval],
        { account: issuer.account }
      );
      await publicClient.waitForTransactionReceipt({ hash });
      
      const invoice: any = await invoiceEscrow.read.getAgreement([1n]);
      assert.equal(invoice.isRecurring, true);
      assert.equal(invoice.recurringInterval, interval);
      assert.ok(invoice.nextRecurringDate > 0n);
      
      // Note: Auto-generation of next invoice happens on confirmDelivery()
      // only if block.timestamp >= nextRecurringDate (30 days have passed)
      // This requires time manipulation in tests, which is not demonstrated here
    });
  });
  
  describe("Dispute Resolution", () => {
    it("Should allow raising a dispute", async () => {
      const { invoiceEscrow, issuer, payer, receiver, publicClient } = await deployContract();
      
      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");
      
      await createBasicInvoice(invoiceEscrow, issuer, payer.account.address, receiver.account.address, amount, token, publicClient);
      
      // Fund and deliver
      let hash = await invoiceEscrow.write.markAsFunded([1n, amount], { account: payer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      hash = await invoiceEscrow.write.submitDelivery([1n, "proof"], { account: issuer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      // Raise dispute
      hash = await invoiceEscrow.write.raiseDispute([1n, "Item not as described"], { account: payer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      const agreement: any = await invoiceEscrow.read.getAgreement([1n]);
      assert.equal(agreement.status, 5); // Disputed
      
      const dispute: any = await invoiceEscrow.read.getInvoiceDispute([1n]);
      assert.equal(dispute.initiator.toLowerCase(), payer.account.address.toLowerCase());
      assert.equal(dispute.status, 1); // Raised
    });
    
    it("Should allow arbiter to resolve dispute", async () => {
      const { invoiceEscrow, admin, issuer, payer, receiver, arbiter, publicClient } = await deployContract();
      
      const amount = parseUnits("1000", 18);
      const refundAmount = parseUnits("500", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");
      
      // Grant arbiter role
      const ARBITER_ROLE = await invoiceEscrow.read.ARBITER_ROLE();
      let hash = await invoiceEscrow.write.grantRole([ARBITER_ROLE, arbiter.account.address], { account: admin.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      // Create and fund invoice
      await createBasicInvoice(invoiceEscrow, issuer, payer.account.address, receiver.account.address, amount, token, publicClient);
      
      hash = await invoiceEscrow.write.markAsFunded([1n, amount], { account: payer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      hash = await invoiceEscrow.write.submitDelivery([1n, "proof"], { account: issuer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      // Raise and resolve dispute
      hash = await invoiceEscrow.write.raiseDispute([1n, "Partial refund needed"], { account: payer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      hash = await invoiceEscrow.write.resolveDispute([1n, 4, "Partial refund approved", refundAmount], { account: arbiter.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      const dispute: any = await invoiceEscrow.read.getInvoiceDispute([1n]);
      assert.equal(dispute.status, 4); // ResolvedForPayer
      assert.equal(dispute.refundAmount, refundAmount);
    });
  });
  
  describe("KYC Compliance", () => {
    it("Should allow operator to set KYC status", async () => {
      const { invoiceEscrow, admin, operator, publicClient } = await deployContract();
      
      const OPERATOR_ROLE = await invoiceEscrow.read.OPERATOR_ROLE();
      let hash = await invoiceEscrow.write.grantRole([OPERATOR_ROLE, operator.account.address], { account: admin.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      hash = await invoiceEscrow.write.setKYCStatus([operator.account.address, true], { account: operator.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      const isVerified = await invoiceEscrow.read.kycVerified([operator.account.address]);
      assert.equal(isVerified, true);
    });
    
    it("Should allow batch KYC operations", async () => {
      const { invoiceEscrow, admin, operator, payer, receiver, publicClient } = await deployContract();
      
      const OPERATOR_ROLE = await invoiceEscrow.read.OPERATOR_ROLE();
      let hash = await invoiceEscrow.write.grantRole([OPERATOR_ROLE, operator.account.address], { account: admin.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      const users = [payer.account.address, receiver.account.address];
      hash = await invoiceEscrow.write.batchSetKYCStatus([users, true], { account: operator.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      assert.equal(await invoiceEscrow.read.kycVerified([payer.account.address]), true);
      assert.equal(await invoiceEscrow.read.kycVerified([receiver.account.address]), true);
    });
  });
  
  describe("Admin Functions", () => {
    it("Should update platform settings with admin role", async () => {
      const { invoiceEscrow, admin, publicClient } = await deployContract();
      
      const hash = await invoiceEscrow.write.updatePlatformSettings(
        [350n, parseUnits("2000000", 18), parseUnits("5", 18), 86400n * 14n, 86400n * 30n, false, parseUnits("50000", 18)],
        { account: admin.account }
      );
      await publicClient.waitForTransactionReceipt({ hash });
      
      const settings = await invoiceEscrow.read.platformSettings();
      assert.equal(settings[0], 350n); // platformFee updated to 3.5%
    });
    
    it("Should allow admin to update platform settings", async () => {
      const { invoiceEscrow, admin, publicClient } = await deployContract();
      
      const hash = await invoiceEscrow.write.updatePlatformSettings(
        [300n, parseUnits("2000000", 18), parseUnits("10", 18), 86400n * 14n, 86400n * 30n, true, parseUnits("50000", 18)],
        { account: admin.account }
      );
      await publicClient.waitForTransactionReceipt({ hash });
      
      const settings = await invoiceEscrow.read.platformSettings();
      assert.equal(settings[0], 300n); // platformFee: 3%
      assert.equal(settings[5], true); // requireKYC
    });
    
    it("Should allow admin to add supported tokens", async () => {
      const { invoiceEscrow, admin, publicClient } = await deployContract();
      
      const newToken = getAddress("0x0000000000000000000000000000000000000002");
      const hash = await invoiceEscrow.write.setSupportedToken([newToken, true], { account: admin.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      const isSupported = await invoiceEscrow.read.supportedTokens([newToken]);
      assert.equal(isSupported, true);
      
      const tokenList = await invoiceEscrow.read.getSupportedTokens();
      assert.ok(tokenList.length >= 2);
    });
    
    it("Should allow admin to pause and unpause", async () => {
      const { invoiceEscrow, admin, issuer, payer, receiver, publicClient } = await deployContract();
      
      // Pause
      let hash = await invoiceEscrow.write.pause([], { account: admin.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      // Try to create invoice - should fail
      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");
      
      await assert.rejects(async () => {
        await createBasicInvoice(invoiceEscrow, issuer, payer.account.address, receiver.account.address, amount, token, publicClient);
      });
      
      // Unpause
      hash = await invoiceEscrow.write.unpause([], { account: admin.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      // Should work now
      await createBasicInvoice(invoiceEscrow, issuer, payer.account.address, receiver.account.address, amount, token, publicClient);
      const total = await invoiceEscrow.read.getTotalInvoices();
      assert.equal(total, 1n);
    });
  });
  
  describe("Invoice Cancellation", () => {
    it("Should allow issuer to cancel pending invoice", async () => {
      const { invoiceEscrow, issuer, payer, receiver, publicClient } = await deployContract();
      
      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");
      
      await createBasicInvoice(invoiceEscrow, issuer, payer.account.address, receiver.account.address, amount, token, publicClient);
      
      const hash = await invoiceEscrow.write.cancelInvoice([1n, "No longer needed"], { account: issuer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      const agreement: any = await invoiceEscrow.read.getAgreement([1n]);
      assert.equal(agreement.status, 8); // Cancelled
    });
    
    it("Should not allow cancellation after delivery", async () => {
      const { invoiceEscrow, issuer, payer, receiver, publicClient } = await deployContract();
      
      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");
      
      await createBasicInvoice(invoiceEscrow, issuer, payer.account.address, receiver.account.address, amount, token, publicClient);
      
      let hash = await invoiceEscrow.write.markAsFunded([1n, amount], { account: payer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      hash = await invoiceEscrow.write.submitDelivery([1n, "proof"], { account: issuer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      await assert.rejects(
        async () => {
          await invoiceEscrow.write.cancelInvoice([1n, "Too late"], { account: issuer.account });
        },
        /Cannot cancel at this stage/
      );
    });
  });
  
  describe("Query & Pagination", () => {
    it("Should track invoices by issuer, payer, and receiver", async () => {
      const { invoiceEscrow, issuer, payer, receiver, publicClient } = await deployContract();
      
      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");
      
      // Create 3 invoices
      for (let i = 0; i < 3; i++) {
        await createBasicInvoice(invoiceEscrow, issuer, payer.account.address, receiver.account.address, amount, token, publicClient);
      }
      
      const [issuerInvoices, issuerTotal] = await invoiceEscrow.read.getIssuerInvoices([issuer.account.address, 0n, 10n]);
      const [payerInvoices, payerTotal] = await invoiceEscrow.read.getPayerInvoices([payer.account.address, 0n, 10n]);
      const [receiverInvoices, receiverTotal] = await invoiceEscrow.read.getReceiverInvoices([receiver.account.address, 0n, 10n]);
      
      assert.equal(issuerInvoices.length, 3);
      assert.equal(payerInvoices.length, 3);
      assert.equal(receiverInvoices.length, 3);
      assert.equal(issuerTotal, 3n);
    });
    
    it("Should paginate results correctly", async () => {
      const { invoiceEscrow, issuer, payer, receiver, publicClient } = await deployContract();
      
      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");
      
      // Create 5 invoices
      for (let i = 0; i < 5; i++) {
        await createBasicInvoice(invoiceEscrow, issuer, payer.account.address, receiver.account.address, amount, token, publicClient);
      }
      
      // Get first 2
      const [page1, total] = await invoiceEscrow.read.getIssuerInvoices([issuer.account.address, 0n, 2n]);
      assert.equal(page1.length, 2);
      assert.equal(total, 5n);
      
      // Get next 2
      const [page2] = await invoiceEscrow.read.getIssuerInvoices([issuer.account.address, 2n, 2n]);
      assert.equal(page2.length, 2);
      
      // Get last 1
      const [page3] = await invoiceEscrow.read.getIssuerInvoices([issuer.account.address, 4n, 2n]);
      assert.equal(page3.length, 1);
    });
  });
  
  describe("Access Control", () => {
    it("Should enforce role-based access for admin functions", async () => {
      const { invoiceEscrow, other } = await deployContract();
      
      await assert.rejects(
        async () => {
          await invoiceEscrow.write.pause([], { account: other.account });
        }
      );
    });
    
    it("Should enforce payer-only access for funding", async () => {
      const { invoiceEscrow, issuer, payer, receiver, other, publicClient } = await deployContract();
      
      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");
      
      await createBasicInvoice(invoiceEscrow, issuer, payer.account.address, receiver.account.address, amount, token, publicClient);
      
      await assert.rejects(
        async () => {
          await invoiceEscrow.write.markAsFunded([1n, amount], { account: other.account });
        },
        /Not payer/
      );
    });
    
    it("Should enforce issuer-only access for delivery submission", async () => {
      const { invoiceEscrow, issuer, payer, receiver, other, publicClient } = await deployContract();
      
      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");
      
      await createBasicInvoice(invoiceEscrow, issuer, payer.account.address, receiver.account.address, amount, token, publicClient);
      
      const hash = await invoiceEscrow.write.markAsFunded([1n, amount], { account: payer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      await assert.rejects(
        async () => {
          await invoiceEscrow.write.submitDelivery([1n, "proof"], { account: other.account });
        },
        /Not issuer/
      );
    });
  });
  
  describe("Event Emissions", () => {
    it("Should emit InvoiceCreated event", async () => {
      const { invoiceEscrow, issuer, payer, receiver, publicClient } = await deployContract();
      
      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");
      
      await createBasicInvoice(invoiceEscrow, issuer, payer.account.address, receiver.account.address, amount, token, publicClient);
      
      const logs = await invoiceEscrow.getEvents.InvoiceCreated();
      assert.ok(logs.length > 0);
      assert.equal(logs[logs.length - 1].args.invoiceId, 1n);
      assert.equal(logs[logs.length - 1].args.issuer?.toLowerCase(), issuer.account.address.toLowerCase());
    });
    
    it("Should emit InvoiceCompleted with platform fee", async () => {
      const { invoiceEscrow, issuer, payer, receiver, publicClient } = await deployContract();
      
      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");
      
      await createBasicInvoice(invoiceEscrow, issuer, payer.account.address, receiver.account.address, amount, token, publicClient);
      
      let hash = await invoiceEscrow.write.markAsFunded([1n, amount], { account: payer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      hash = await invoiceEscrow.write.submitDelivery([1n, "proof"], { account: issuer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      hash = await invoiceEscrow.write.confirmDelivery([1n], { account: receiver.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      const logs = await invoiceEscrow.getEvents.InvoiceCompleted();
      assert.ok(logs.length > 0);
      assert.equal(logs[logs.length - 1].args.invoiceId, 1n);
      // Platform fee should be 2.5% of 1000 = 25
      assert.equal(logs[logs.length - 1].args.platformFeeCollected, parseUnits("25", 18));
    });
  });
});
