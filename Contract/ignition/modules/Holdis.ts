import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const HoldisModule = buildModule("Holdis", (m) => {
  const admin = m.getAccount(0);
  
  const holdis = m.contract("Holdis", [], {
    id: "Holdis_Implementation",
  });
  
  // Initialize the contract
  m.call(holdis, "initialize", [admin], {
    id: "Holdis_Initialization",
  });
  
  return { holdis };
});

export default HoldisModule;
