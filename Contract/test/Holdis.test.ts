import { describe, it, before } from "node:test";
import assert from "node:assert";
import { network } from "hardhat";
import { parseUnits, getAddress, type Address, type WalletClient, type PublicClient, type GetContractReturnType } from "viem";

describe("Holdis - Invoice & Payment System", () => {
  async function deployContract() {
    const { viem } = await network.connect();
    const [admin, issuer, payer, receiver] = await viem.getWalletClients();
    const holdis = await viem.deployContract("Holdis");
    await holdis.write.initialize([admin.account.address]);
    const publicClient = await viem.getPublicClient();

    return { holdis, admin, issuer, payer, receiver, publicClient };
  }

  describe("Deployment & Initialization", () => {
    it("Should initialize with correct admin role", async () => {
      const { holdis, admin } = await deployContract();

      const hasAdminRole = await holdis.read.hasRole([
        await holdis.read.ADMIN_ROLE(),
        admin.account.address,
      ]);

      assert.equal(hasAdminRole, true);
    });

    it("Should initialize with default platform settings", async () => {
      const { holdis } = await deployContract();

      const settings = await holdis.read.platformSettings();
      
      assert.equal(settings[0], 250n); // platformFee: 2.5%
      assert.equal(settings[1], parseUnits("1000000", 18)); // maxInvoiceAmount
      assert.equal(settings[2], parseUnits("1", 18)); // minInvoiceAmount
    });

    it("Should support native token by default", async () => {
      const { holdis } = await deployContract();

      const nativeToken = getAddress("0x0000000000000000000000000000000000000000");
      const isSupported = await holdis.read.supportedTokens([nativeToken]);

      assert.equal(isSupported, true);
    });
  });

  describe("Direct Payment Mode (No Delivery Required)", () => {
    it("Should create invoice and auto-complete on payment", async () => {
      const { holdis, issuer, payer, receiver, publicClient } = await deployContract();

      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");

      // Create invoice without delivery requirement
      const hash = await holdis.write.createInvoice(
        [
          payer.account.address,
          receiver.account.address,
          amount,
          token,
          false, // requiresDelivery = false
          "Payment for web design",
          "QmXYZ123..."
        ],
        { account: issuer.account }
      );

      await publicClient.waitForTransactionReceipt({ hash });

      const invoiceId = 1n;
      const invoice = await holdis.read.getInvoice([invoiceId]) as any;

      assert.equal(invoice.issuer.toLowerCase(), issuer.account.address.toLowerCase());
      assert.equal(invoice.payer.toLowerCase(), payer.account.address.toLowerCase());
      assert.equal(invoice.receiver.toLowerCase(), receiver.account.address.toLowerCase());
      assert.equal(invoice.amount, amount);
      assert.equal(invoice.requiresDelivery, false);
      assert.equal(invoice.status, 0); // Pending

      // Mark as funded - should auto-complete
      const fundHash = await holdis.write.markAsFunded([invoiceId], { account: payer.account });
      await publicClient.waitForTransactionReceipt({ hash: fundHash });

      const updatedInvoice = await holdis.read.getInvoice([invoiceId]) as any;
      assert.equal(updatedInvoice.status, 3); // Completed
    });
  });

  describe("Escrow Mode (With Delivery)", () => {
    it("Should complete full escrow flow: Pending → Funded → Delivered → Completed", async () => {
      const { holdis, issuer, payer, receiver, publicClient } = await deployContract();

      const amount = parseUnits("5000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");

      // 1. Create invoice with delivery requirement
      const createHash = await holdis.write.createInvoice(
        [
          payer.account.address,
          receiver.account.address,
          amount,
          token,
          true, // requiresDelivery = true
          "Custom software development",
          "QmABC456..."
        ],
        { account: issuer.account }
      );

      await publicClient.waitForTransactionReceipt({ hash: createHash });

      const invoiceId = 1n;
      let invoice = await holdis.read.getInvoice([invoiceId]) as any;
      assert.equal(invoice.status, 0); // Pending
      assert.equal(invoice.requiresDelivery, true);

      // 2. Mark as funded
      const fundHash = await holdis.write.markAsFunded([invoiceId], { account: payer.account });
      await publicClient.waitForTransactionReceipt({ hash: fundHash });

      invoice = await holdis.read.getInvoice([invoiceId]) as any;
      assert.equal(invoice.status, 1); // Funded (not auto-completed because requiresDelivery)

      // 3. Submit delivery
      const deliveryHash = await holdis.write.submitDelivery(
        [invoiceId, "QmProofHash789..."],
        { account: issuer.account }
      );
      await publicClient.waitForTransactionReceipt({ hash: deliveryHash });

      invoice = await holdis.read.getInvoice([invoiceId]) as any;
      assert.equal(invoice.status, 2); // Delivered

      // 4. Confirm delivery
      const confirmHash = await holdis.write.confirmDelivery([invoiceId], { account: receiver.account });
      await publicClient.waitForTransactionReceipt({ hash: confirmHash });

      invoice = await holdis.read.getInvoice([invoiceId]) as any;
      assert.equal(invoice.status, 3); // Completed
    });

    it("Should not allow delivery submission on non-escrow invoice", async () => {
      const { holdis, issuer, payer, receiver, publicClient } = await deployContract();

      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");

      // Create invoice WITHOUT delivery requirement
      const createHash = await holdis.write.createInvoice(
        [
          payer.account.address,
          receiver.account.address,
          amount,
          token,
          false, // requiresDelivery = false
          "Simple payment",
          "Qm..."
        ],
        { account: issuer.account }
      );

      await publicClient.waitForTransactionReceipt({ hash: createHash });

      const invoiceId = 1n;

      // Fund it (will auto-complete)
      const fundHash = await holdis.write.markAsFunded([invoiceId], { account: payer.account });
      await publicClient.waitForTransactionReceipt({ hash: fundHash });

      // Try to submit delivery - should fail
      await assert.rejects(async () => {
        await holdis.write.submitDelivery(
          [invoiceId, "QmProof..."],
          { account: issuer.account }
        );
      });
    });
  });

  describe("Invoice Cancellation", () => {
    it("Should allow issuer to cancel pending invoice", async () => {
      const { holdis, issuer, payer, receiver, publicClient } = await deployContract();

      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");

      const createHash = await holdis.write.createInvoice(
        [
          payer.account.address,
          receiver.account.address,
          amount,
          token,
          false,
          "Test invoice",
          "Qm..."
        ],
        { account: issuer.account }
      );

      await publicClient.waitForTransactionReceipt({ hash: createHash });

      const invoiceId = 1n;

      // Cancel invoice
      const cancelHash = await holdis.write.cancelInvoice(
        [invoiceId, "Changed my mind"],
        { account: issuer.account }
      );

      await publicClient.waitForTransactionReceipt({ hash: cancelHash });

      const invoice = await holdis.read.getInvoice([invoiceId]) as any;
      assert.equal(invoice.status, 4); // Cancelled
    });

    it("Should not allow cancellation of funded invoice", async () => {
      const { holdis, issuer, payer, receiver, publicClient } = await deployContract();

      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");

      const createHash = await holdis.write.createInvoice(
        [
          payer.account.address,
          receiver.account.address,
          amount,
          token,
          true, // requiresDelivery
          "Test invoice",
          "Qm..."
        ],
        { account: issuer.account }
      );

      await publicClient.waitForTransactionReceipt({ hash: createHash });

      const invoiceId = 1n;

      // Fund invoice
      const fundHash = await holdis.write.markAsFunded([invoiceId], { account: payer.account });
      await publicClient.waitForTransactionReceipt({ hash: fundHash });

      // Try to cancel - should fail
      await assert.rejects(async () => {
        await holdis.write.cancelInvoice(
          [invoiceId, "Too late"],
          { account: issuer.account }
        );
      });
    });
  });

  describe("Query Functions", () => {
    it("Should track invoices by issuer, payer, and receiver", async () => {
      const { holdis, issuer, payer, receiver, publicClient } = await deployContract();

      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");

      // Create 2 invoices
      for (let i = 0; i < 2; i++) {
        const hash = await holdis.write.createInvoice(
          [
            payer.account.address,
            receiver.account.address,
            amount,
            token,
            false,
            `Invoice ${i + 1}`,
            "Qm..."
          ],
          { account: issuer.account }
        );
        await publicClient.waitForTransactionReceipt({ hash });
      }

      const [issuerInvoices] = await holdis.read.getIssuerInvoices([issuer.account.address, 0n, 10n]);
      const [payerInvoices] = await holdis.read.getPayerInvoices([payer.account.address, 0n, 10n]);
      const [receiverInvoices] = await holdis.read.getReceiverInvoices([receiver.account.address, 0n, 10n]);

      assert.equal(issuerInvoices.length, 2);
      assert.equal(payerInvoices.length, 2);
      assert.equal(receiverInvoices.length, 2);
    });

    it("Should paginate results correctly", async () => {
      const { holdis, issuer, payer, receiver, publicClient } = await deployContract();

      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");

      // Create 5 invoices
      for (let i = 0; i < 5; i++) {
        const hash = await holdis.write.createInvoice(
          [
            payer.account.address,
            receiver.account.address,
            amount,
            token,
            false,
            `Invoice ${i + 1}`,
            "Qm..."
          ],
          { account: issuer.account }
        );
        await publicClient.waitForTransactionReceipt({ hash });
      }

      // Get first 2
      const [page1, total] = await holdis.read.getIssuerInvoices([issuer.account.address, 0n, 2n]);
      assert.equal(page1.length, 2);
      assert.equal(total, 5n);

      // Get next 2
      const [page2] = await holdis.read.getIssuerInvoices([issuer.account.address, 2n, 2n]);
      assert.equal(page2.length, 2);
    });
  });

  describe("Admin Functions", () => {
    it("Should update platform settings", async () => {
      const { holdis, admin, publicClient } = await deployContract();

      const newFee = 300n; // 3%
      const newMax = parseUnits("2000000", 18);
      const newMin = parseUnits("10", 18);

      const hash = await holdis.write.updatePlatformSettings(
        [newFee, newMax, newMin],
        { account: admin.account }
      );

      await publicClient.waitForTransactionReceipt({ hash });

      const settings = await holdis.read.platformSettings();
      assert.equal(settings[0], newFee);
      assert.equal(settings[1], newMax);
      assert.equal(settings[2], newMin);
    });

    it("Should allow admin to add supported tokens", async () => {
      const { holdis, admin, publicClient } = await deployContract();

      const usdcAddress = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

      const hash = await holdis.write.setSupportedToken(
        [usdcAddress, true],
        { account: admin.account }
      );

      await publicClient.waitForTransactionReceipt({ hash });

      const isSupported = await holdis.read.supportedTokens([usdcAddress]);
      assert.equal(isSupported, true);

      const tokenList = await holdis.read.getSupportedTokens();
      assert.equal(tokenList.length, 2); // Native + USDC
    });

    it("Should allow admin to pause and unpause", async () => {
      const { holdis, admin, issuer, payer, receiver, publicClient } = await deployContract();

      // Pause
      const pauseHash = await holdis.write.pause({ account: admin.account });
      await publicClient.waitForTransactionReceipt({ hash: pauseHash });

      // Try to create invoice - should fail
      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");

      await assert.rejects(async () => {
        await holdis.write.createInvoice(
          [
            payer.account.address,
            receiver.account.address,
            amount,
            token,
            false,
            "Test",
            "Qm..."
          ],
          { account: issuer.account }
        );
      });

      // Unpause
      const unpauseHash = await holdis.write.unpause({ account: admin.account });
      await publicClient.waitForTransactionReceipt({ hash: unpauseHash });

      // Should work now
      const hash = await holdis.write.createInvoice(
        [
          payer.account.address,
          receiver.account.address,
          amount,
          token,
          false,
          "Test",
          "Qm..."
        ],
        { account: issuer.account }
      );
      await publicClient.waitForTransactionReceipt({ hash });

      const total = await holdis.read.getTotalInvoices();
      assert.equal(total, 1n);
    });
  });

  describe("Access Control", () => {
    it("Should enforce admin-only access for platform settings", async () => {
      const { holdis, issuer } = await deployContract();

      await assert.rejects(async () => {
        await holdis.write.updatePlatformSettings(
          [300n, parseUnits("2000000", 18), parseUnits("10", 18)],
          { account: issuer.account }
        );
      });
    });

    it("Should enforce payer-only access for funding", async () => {
      const { holdis, issuer, payer, receiver, publicClient } = await deployContract();

      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");

      const hash = await holdis.write.createInvoice(
        [
          payer.account.address,
          receiver.account.address,
          amount,
          token,
          true,
          "Test",
          "Qm..."
        ],
        { account: issuer.account }
      );

      await publicClient.waitForTransactionReceipt({ hash });

      const invoiceId = 1n;

      // Try to mark as funded by non-payer
      await assert.rejects(async () => {
        await holdis.write.markAsFunded([invoiceId], { account: receiver.account });
      });
    });

    it("Should enforce issuer-only access for delivery submission", async () => {
      const { holdis, issuer, payer, receiver, publicClient } = await deployContract();

      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");

      const createHash = await holdis.write.createInvoice(
        [
          payer.account.address,
          receiver.account.address,
          amount,
          token,
          true,
          "Test",
          "Qm..."
        ],
        { account: issuer.account }
      );

      await publicClient.waitForTransactionReceipt({ hash: createHash });

      const invoiceId = 1n;

      // Fund invoice
      const fundHash = await holdis.write.markAsFunded([invoiceId], { account: payer.account });
      await publicClient.waitForTransactionReceipt({ hash: fundHash });

      // Try to submit delivery as payer
      await assert.rejects(async () => {
        await holdis.write.submitDelivery(
          [invoiceId, "QmProof..."],
          { account: payer.account }
        );
      });
    });
  });

  describe("Event Emissions", () => {
    it("Should emit InvoiceCreated event", async () => {
      const { holdis, issuer, payer, receiver, publicClient } = await deployContract();

      const amount = parseUnits("1000", 18);
      const token = getAddress("0x0000000000000000000000000000000000000000");

      const hash = await holdis.write.createInvoice(
        [
          payer.account.address,
          receiver.account.address,
          amount,
          token,
          false,
          "Test invoice",
          "QmXYZ..."
        ],
        { account: issuer.account }
      );

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      assert.equal(receipt.status, "success");
    });

    it("Should emit InvoiceCompleted with platform fee", async () => {
      const { holdis, issuer, payer, receiver, publicClient } = await deployContract();

      const amount = parseUnits("10000", 18); // 10,000 tokens
      const token = getAddress("0x0000000000000000000000000000000000000000");

      const createHash = await holdis.write.createInvoice(
        [
          payer.account.address,
          receiver.account.address,
          amount,
          token,
          false, // No delivery, auto-complete
          "Big payment",
          "Qm..."
        ],
        { account: issuer.account }
      );

      await publicClient.waitForTransactionReceipt({ hash: createHash });

      const invoiceId = 1n;

      // Mark as funded - will auto-complete and emit fee event
      const fundHash = await holdis.write.markAsFunded([invoiceId], { account: payer.account });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: fundHash });

      assert.equal(receipt.status, "success");

      // Platform fee should be 2.5% = 250 tokens
      const expectedFee = (10000n * 250n) / 10000n; // 250 basis points
      assert.equal(expectedFee, 250n);
    });
  });
});
