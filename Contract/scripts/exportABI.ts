import { writeFileSync } from "fs";
import { join } from "path";

// This script exports the contract ABI for backend integration
async function main() {
  const artifactPath = "../artifacts/contracts/InvoiceEscrow.sol/InvoiceEscrow.json";
  const artifact = await import(artifactPath);
  
  const abi = artifact.abi;
  
  // Export to Backend folder
  const outputPath = join(__dirname, "../../Backend/src/contracts/InvoiceEscrow.json");
  
  writeFileSync(outputPath, JSON.stringify({ abi }, null, 2));
  
  console.log("ABI exported to:", outputPath);
  console.log("\nContract Functions:");
  
  abi
    .filter((item: any) => item.type === "function")
    .forEach((func: any) => {
      console.log(`- ${func.name}(${func.inputs.map((i: any) => `${i.type} ${i.name}`).join(", ")})`);
    });
  
  console.log("\nContract Events:");
  
  abi
    .filter((item: any) => item.type === "event")
    .forEach((event: any) => {
      console.log(`- ${event.name}(${event.inputs.map((i: any) => `${i.type} ${i.name}`).join(", ")})`);
    });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
