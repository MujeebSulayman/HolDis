import { describe, it, before } from "node:test";
import { strict as assert } from "node:assert";
import { network } from "hardhat";
import { getAddress, parseUnits } from "viem";

describe("InvoiceEscrow", () => {
  describe("Deployment", () => {
    it("Should set the admin role correctly", async () => {
      const { viem } = await network.connect();
      const [admin] = await viem.getWalletClients();
      const invoiceEscrow = await viem.deployContract("InvoiceEscrow");
      await invoiceEscrow.write.initialize([admin.account.address]);
      
      const ADMIN_ROLE = await invoiceEscrow.read.ADMIN_ROLE();
      const hasRole = await invoiceEscrow.read.hasRole([ADMIN_ROLE, admin.account.address]);
      
      assert.equal(hasRole, true);
    });
    
    it("Should start with zero invoices", async () => {
      const { viem } = await network.connect();
      const [admin] = await viem.getWalletClients();
      const invoiceEscrow = await viem.deployContract("InvoiceEscrow");
      await invoiceEscrow.write.initialize([admin.account.address]);
      
      const totalInvoices = await invoiceEscrow.read.getTotalInvoices();
      assert.equal(totalInvoices, 0n);
    });
  });
  
  describe("Invoice Creation", () => {
    it("Should create an invoice successfully", async () => {
      const { viem } = await network.connect();
      const [admin, issuer, payer, receiver] = await viem.getWalletClients();
      const invoiceEscrow = await viem.deployContract("InvoiceEscrow");
      await invoiceEscrow.write.initialize([admin.account.address]);
      const publicClient = await viem.getPublicClient();
      
      const amount = parseUnits("1000", 6);
      const currency = "USDC";
      const metadata = '{"description": "Payment for services"}';
      
      const hash = await invoiceEscrow.write.createInvoice(
        [payer.account.address, receiver.account.address, amount, currency, metadata],
        { account: issuer.account }
      );
      
      await publicClient.waitForTransactionReceipt({ hash });
      
      const totalInvoices = await invoiceEscrow.read.getTotalInvoices();
      assert.equal(totalInvoices, 1n);
      
      const agreement = await invoiceEscrow.read.getAgreement([1n]);
      assert.equal(agreement.issuer.toLowerCase(), issuer.account.address.toLowerCase());
      assert.equal(agreement.payer.toLowerCase(), payer.account.address.toLowerCase());
      assert.equal(agreement.receiver.toLowerCase(), receiver.account.address.toLowerCase());
      assert.equal(agreement.amount, amount);
      assert.equal(agreement.currency, currency);
      assert.equal(agreement.status, 0);
    });
    
    it("Should reject zero amount", async () => {
      const { viem } = await network.connect();
      const [admin, issuer, payer, receiver] = await viem.getWalletClients();
      const invoiceEscrow = await viem.deployContract("InvoiceEscrow");
      await invoiceEscrow.write.initialize([admin.account.address]);
      
      await assert.rejects(
        async () => {
          await invoiceEscrow.write.createInvoice(
            [payer.account.address, receiver.account.address, 0n, "USDC", "{}"],
            { account: issuer.account }
          );
        },
        /Amount must be positive/
      );
    });
  });
  
  describe("Full Invoice Flow", () => {
    it("Should complete full invoice lifecycle", async () => {
      const { viem } = await network.connect();
      const [admin, issuer, payer, receiver] = await viem.getWalletClients();
      const invoiceEscrow = await viem.deployContract("InvoiceEscrow");
      await invoiceEscrow.write.initialize([admin.account.address]);
      const publicClient = await viem.getPublicClient();
      
      // Create invoice
      let hash = await invoiceEscrow.write.createInvoice(
        [payer.account.address, receiver.account.address, parseUnits("1000", 6), "USDC", "{}"],
        { account: issuer.account }
      );
      await publicClient.waitForTransactionReceipt({ hash });
      
      // Fund invoice
      hash = await invoiceEscrow.write.markAsFunded([1n], { account: payer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      let agreement = await invoiceEscrow.read.getAgreement([1n]);
      assert.equal(agreement.status, 1); // Funded
      
      // Submit delivery
      hash = await invoiceEscrow.write.submitDelivery([1n], { account: issuer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      agreement = await invoiceEscrow.read.getAgreement([1n]);
      assert.equal(agreement.status, 2); // Delivered
      
      // Confirm delivery
      hash = await invoiceEscrow.write.confirmDelivery([1n], { account: receiver.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      agreement = await invoiceEscrow.read.getAgreement([1n]);
      assert.equal(agreement.status, 3); // Completed
      assert.ok(agreement.completedAt > 0n);
    });
  });
  
  describe("Admin Functions", () => {
    it("Should allow admin to adjust invoice status", async () => {
      const { viem } = await network.connect();
      const [admin, issuer, payer, receiver] = await viem.getWalletClients();
      const invoiceEscrow = await viem.deployContract("InvoiceEscrow");
      await invoiceEscrow.write.initialize([admin.account.address]);
      const publicClient = await viem.getPublicClient();
      
      let hash = await invoiceEscrow.write.createInvoice(
        [payer.account.address, receiver.account.address, parseUnits("1000", 6), "USDC", "{}"],
        { account: issuer.account }
      );
      await publicClient.waitForTransactionReceipt({ hash });
      
      hash = await invoiceEscrow.write.adminAdjustStatus([1n, 4, "Manual adjustment"], { account: admin.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      const agreement = await invoiceEscrow.read.getAgreement([1n]);
      assert.equal(agreement.status, 4);
    });
    
    it("Should allow admin to pause and unpause", async () => {
      const { viem } = await network.connect();
      const [admin, issuer, payer, receiver] = await viem.getWalletClients();
      const invoiceEscrow = await viem.deployContract("InvoiceEscrow");
      await invoiceEscrow.write.initialize([admin.account.address]);
      const publicClient = await viem.getPublicClient();
      
      // Pause
      let hash = await invoiceEscrow.write.pause([], { account: admin.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      // Try to create invoice while paused - should fail
      await assert.rejects(
        async () => {
          await invoiceEscrow.write.createInvoice(
            [payer.account.address, receiver.account.address, parseUnits("1000", 6), "USDC", "{}"],
            { account: issuer.account }
          );
        }
      );
      
      // Unpause
      hash = await invoiceEscrow.write.unpause([], { account: admin.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      // Should work now
      hash = await invoiceEscrow.write.createInvoice(
        [payer.account.address, receiver.account.address, parseUnits("1000", 6), "USDC", "{}"],
        { account: issuer.account }
      );
      await publicClient.waitForTransactionReceipt({ hash });
      
      const totalInvoices = await invoiceEscrow.read.getTotalInvoices();
      assert.equal(totalInvoices, 1n);
    });
  });
  
  describe("Invoice Cancellation", () => {
    it("Should allow issuer to cancel pending invoice", async () => {
      const { viem } = await network.connect();
      const [admin, issuer, payer, receiver] = await viem.getWalletClients();
      const invoiceEscrow = await viem.deployContract("InvoiceEscrow");
      await invoiceEscrow.write.initialize([admin.account.address]);
      const publicClient = await viem.getPublicClient();
      
      let hash = await invoiceEscrow.write.createInvoice(
        [payer.account.address, receiver.account.address, parseUnits("1000", 6), "USDC", "{}"],
        { account: issuer.account }
      );
      await publicClient.waitForTransactionReceipt({ hash });
      
      hash = await invoiceEscrow.write.cancelInvoice([1n, "Cancelled by issuer"], { account: issuer.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      const agreement = await invoiceEscrow.read.getAgreement([1n]);
      assert.equal(agreement.status, 5);
    });
  });
  
  describe("Query Functions", () => {
    it("Should track invoices by party", async () => {
      const { viem } = await network.connect();
      const [admin, issuer, payer, receiver] = await viem.getWalletClients();
      const invoiceEscrow = await viem.deployContract("InvoiceEscrow");
      await invoiceEscrow.write.initialize([admin.account.address]);
      const publicClient = await viem.getPublicClient();
      
      // Create multiple invoices
      for (let i = 0; i < 3; i++) {
        const hash = await invoiceEscrow.write.createInvoice(
          [payer.account.address, receiver.account.address, parseUnits("1000", 6), "USDC", "{}"],
          { account: issuer.account }
        );
        await publicClient.waitForTransactionReceipt({ hash });
      }
      
      const issuerInvoices = await invoiceEscrow.read.getIssuerInvoices([issuer.account.address]);
      const payerInvoices = await invoiceEscrow.read.getPayerInvoices([payer.account.address]);
      const receiverInvoices = await invoiceEscrow.read.getReceiverInvoices([receiver.account.address]);
      
      assert.equal(issuerInvoices.length, 3);
      assert.equal(payerInvoices.length, 3);
      assert.equal(receiverInvoices.length, 3);
    });
  });
});
