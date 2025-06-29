import { run } from "hardhat";

async function verify(address: string, args: any[]) {
  console.log(`Verifying contract at ${address}...`);

  try {
    await run("verify:verify", {
      address,
      constructorArguments: args,
    });
    console.log("✅ Verification successful!");
  } catch (error: any) {
    if (error.message.toLowerCase().includes("already verified")) {
      console.log("⚠️ Contract already verified");
    } else {
      console.error("❌ Verification failed:", error);
    }
  }
}

export default verify;
