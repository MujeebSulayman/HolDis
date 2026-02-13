import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const InvoiceEscrowModule = buildModule("InvoiceEscrow", (m) => {
  const admin = m.getAccount(0);
  
  const invoiceEscrow = m.contract("InvoiceEscrow", [], {
    id: "InvoiceEscrow_Implementation",
  });
  
  // Initialize the contract
  m.call(invoiceEscrow, "initialize", [admin], {
    id: "InvoiceEscrow_Initialization",
  });
  
  return { invoiceEscrow };
});

export default InvoiceEscrowModule;
