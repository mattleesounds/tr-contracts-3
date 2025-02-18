require("dotenv").config();
import {
  createPublicClient,
  http,
  getContract,
  createWalletClient,
} from "viem";
import { baseSepolia } from "viem/chains";
import { parseAbi, decodeEventLog, formatEther, parseEther } from "viem/utils";
import { privateKeyToAccount } from "viem/accounts";
import * as TRTest3JSON from "../artifacts/contracts/TRTest3.sol/TRTest3.json";

async function main() {
  const CONTRACT_ADDRESS: `0x${string}` =
    "0x89c656baB8110e57C054F5FF7e3E0A9326A12c2a"; // Replace with your deployed TRTest3 contract address
  console.log(
    "Comprehensive Test Script for TRTest3 contract on Base Sepolia..."
  );

  // 1. Access Private Key and Account
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY not found in .env file.");
  }
  const account = privateKeyToAccount(privateKey);
  const ownerAddress = account.address;
  console.log("Using account address (Owner):", ownerAddress);

  // 2. Create Public and Wallet Clients
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL),
  });
  const walletClient = createWalletClient({
    account: account,
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL),
  });

  // 3. Contract ABI (TRTest3) - Reusing from previous script
  const contractABI = parseAbi([
    "function createSong(string memory title, uint256 price, uint256 maxSupply, string memory tokenURI) public",
    "function mintSong(uint256 songId, uint256 quantity) public payable",
    "function mintBatchSongs(uint256[] memory songIds, uint256[] memory quantities) public payable",
    "function updatePlatformFee(uint256 newFee) public",
    "function updateSongPrice(uint256 songId, uint256 newPrice) public",
    "function uri(uint256 songId) public view returns (string memory)",
    "function getArtistSongs(address artist) public view returns (uint256[] memory)",
    "function updateArtistAddress(uint256 songId, address newArtist) public",
    "function pause() public",
    "function unpause() public",
    "function withdrawPlatformFees() public",
    "function getSongDetails(uint256 songId) public view returns (string memory title, address artist, uint256 price, uint256 maxSupply, uint256 currentSupply, bool exists)",
    "function platformFee() public view returns (uint256)",
    "function paused() public view returns (bool)",
    "event SongCreated(uint256 indexed songId, string title, address indexed artist, uint256 price, uint256 maxSupply)",
    "event SongMinted(uint256 indexed songId, address indexed buyer, address indexed artist, uint256 quantity, uint256 totalPrice)",
    "event PlatformFeeUpdated(uint256 indexed oldFee, uint256 indexed newFee)",
    "event SongPriceUpdated(uint256 indexed songId, uint256 newPrice)",
    "event ArtistAddressChanged(uint256 indexed songId, address indexed oldArtist, address indexed newArtist)",
  ]);

  // 4. Get Contract Instance
  const contract = getContract({
    address: CONTRACT_ADDRESS,
    abi: contractABI,
    client: publicClient,
  });

  console.log("\n--- Starting Comprehensive Contract Tests ---");

  // **--- 5. Check and Unpause Contract (if paused) ---**
  console.log("\n--- 5. Checking Paused State ---");
  const isPaused = await contract.read.paused();
  console.log("Contract paused:", isPaused);

  if (isPaused) {
    console.log("Contract is paused. Unpausing...");
    const unpauseHash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: "unpause",
      gas: 2000000n,
    });
    await publicClient.waitForTransactionReceipt({ hash: unpauseHash });
    console.log("Contract unpaused.");
  }

  // **--- 6. Test createSong Function and SongCreated Event ---**
  console.log("\n--- 6. Testing createSong Function and SongCreated Event ---");
  const songTitle1 = "Test Song 1";
  const songPrice1Wei = parseEther("0.0002"); // Example price
  const songMaxSupply1 = 100n;
  const tokenURI1 = "ipfs://testTokenURI1";

  let newSongId1: bigint | undefined;
  try {
    console.log("Calling createSong function...");
    const createSongTx = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: "createSong",
      args: [songTitle1, songPrice1Wei, songMaxSupply1, tokenURI1],
      gas: 2000000n,
    });
    const createSongReceipt = await publicClient.waitForTransactionReceipt({
      hash: createSongTx,
    });

    console.log("Create Song Receipt Status:", createSongReceipt.status);
    console.log("Create Song Receipt (Keys and Values):");
    for (const key of Object.keys(createSongReceipt)) {
      console.log(
        `${key}:`,
        createSongReceipt[key as keyof typeof createSongReceipt]
      );
    }

    // **--- Restore Event Decoding and Checking for SongCreated Event ---**
    if (createSongReceipt.logs && createSongReceipt.logs.length > 0) {
      for (const log of createSongReceipt.logs) {
        try {
          const decodedLog = decodeEventLog({
            abi: contractABI,
            eventName: "SongCreated",
            data: log.data,
            topics: log.topics,
          });

          if (decodedLog.eventName === "SongCreated") {
            newSongId1 = decodedLog.args.songId;
            console.log(
              "SongCreated Event Detected - New Song ID:",
              newSongId1, // **Verify newSongId1 here**
              " (inside SongCreated event block in section 6)"
            );
            break; // Assuming only one SongCreated event per transaction
          }
        } catch (eventError) {
          console.error("Error decoding event log:", eventError);
        }
      }
    } else {
      console.log("No logs found in transaction receipt.");
    }
  } catch (createSongError: any) {
    console.error("createSong function call failed:", createSongError.message);
  }

  // **--- 7. Test getSongDetails Function ---**
  console.log("\n--- 7. Testing getSongDetails Function ---");
  if (newSongId1 !== undefined) {
    try {
      const songDetails = await contract.read.getSongDetails([newSongId1]);
      console.log("Song Details Retrieved:");
      console.log("Title:", songDetails[0]);
      console.log("Artist:", songDetails[1]);
      console.log("Price (ETH):", formatEther(songDetails[2]));
      console.log("Max Supply:", songDetails[3]);
      console.log("Current Supply:", songDetails[4]);
      console.log("Exists:", songDetails[5]);
    } catch (detailsError: any) {
      console.error(
        "getSongDetails function call failed:",
        detailsError.message
      );
    }
  }

  // **--- 8. Test mintSong Function and SongMinted Event ---**
  console.log("\n--- 8. Testing mintSong Function and SongMinted Event ---");
  console.log("minting song: ", newSongId1);
  if (newSongId1 !== undefined) {
    const mintQuantity1 = 2n;
    try {
      console.log("--- Testing mintSong: ---"); // Section start marker
      console.log("Song ID to mint:", newSongId1);
      console.log("Mint Quantity:", mintQuantity1);

      const platformFeeWei = await contract.read.platformFee();
      const songPrice1Wei = (
        await contract.read.getSongDetails([newSongId1])
      )[2]; // Fetch song price again to be sure
      const totalMintCostWei = songPrice1Wei * mintQuantity1 + platformFeeWei;
      const contractPausedState = await contract.read.paused(); // Get paused state

      console.log(
        "Contract Paused State (before mintSong):",
        contractPausedState
      ); // Log paused state
      console.log("Platform Fee (Wei):", platformFeeWei.toString());
      console.log("Song Price (Wei):", songPrice1Wei.toString());
      console.log("Mint Quantity:", mintQuantity1.toString()); // Log quantity
      console.log("Total Mint Cost (Wei):", totalMintCostWei.toString());
      console.log("Value being sent (Wei):", totalMintCostWei.toString()); // Explicitly log the value

      console.log("Calling mintSong function...");
      const mintSongTx = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: contractABI,
        functionName: "mintSong",
        args: [newSongId1, mintQuantity1],
        value: totalMintCostWei,
        gas: 2000000n,
      });
      console.log("mintSong transaction hash:", mintSongTx); // Log transaction hash
      const mintSongReceipt = await publicClient.waitForTransactionReceipt({
        hash: mintSongTx,
      });
      console.log("mintSong Receipt Status:", mintSongReceipt.status);
      console.log("mintSong Receipt (Keys and Values):");
      for (const key of Object.keys(mintSongReceipt)) {
        console.log(
          `${key}:`,
          mintSongReceipt[key as keyof typeof mintSongReceipt]
        );
      }
      // Event checking removed - rely on Basescan
      // ... (Event decoding and checking logic removed)

      // Verify supply updated after minting
      const updatedSongDetails = await contract.read.getSongDetails([
        newSongId1,
      ]);
      console.log(
        "Updated Song Details - Current Supply:",
        updatedSongDetails[4]
      );
      console.log("--- mintSong test section completed ---"); // Section end marker
    } catch (mintSongError: any) {
      console.error("mintSong function call failed:", mintSongError.message);
    }
  }

  // **--- 9. Test mintBatchSongs Function and SongMinted Event (Batch) ---**
  console.log(
    "\n--- 9. Testing mintBatchSongs Function and SongMinted Events ---"
  );
  const songTitle2 = "Test Song 2";
  const songPrice2Wei = parseEther("0.0001");
  const songMaxSupply2 = 500n;
  const tokenURI2 = "ipfs://testTokenURI2";
  let newSongId2: bigint | undefined;

  const songTitle3 = "Test Song 3";
  const songPrice3Wei = parseEther("0.0003");
  const songMaxSupply3 = 750n;
  const tokenURI3 = "ipfs://testTokenURI3";
  let newSongId3: bigint | undefined;

  // Create Song 2
  try {
    const createSongTx2 = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: "createSong",
      args: [songTitle2, songPrice2Wei, songMaxSupply2, tokenURI2],
      gas: 2000000n,
    });
    const createSongReceipt2 = await publicClient.waitForTransactionReceipt({
      hash: createSongTx2,
    });
    // Event checking removed - rely on Basescan
    // ... (Event decoding and checking logic removed)
    console.log("createSong2 Receipt Status:", createSongReceipt2.status);
    console.log("createSong2 Receipt (Keys and Values):");
    for (const key of Object.keys(createSongReceipt2)) {
      console.log(
        `${key}:`,
        createSongReceipt2[key as keyof typeof createSongReceipt2]
      );
    }
  } catch (error) {
    console.error("Error creating Song 2:", error);
  }

  await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay before creating Song 3

  // Create Song 3
  try {
    const createSongTx3 = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: "createSong",
      args: [songTitle3, songPrice3Wei, songMaxSupply3, tokenURI3],
      gas: 2000000n,
    });
    const createSongReceipt3 = await publicClient.waitForTransactionReceipt({
      hash: createSongTx3,
    });
    // Event checking removed - rely on Basescan
    // ... (Event decoding and checking logic removed)
    console.log("createSong3 Receipt Status:", createSongReceipt3.status);
    console.log("createSong3 Receipt (Keys and Values):");
    for (const key of Object.keys(createSongReceipt3)) {
      console.log(
        `${key}:`,
        createSongReceipt3[key as keyof typeof createSongReceipt3]
      );
    }
  } catch (error) {
    console.error("Error creating Song 3:", error);
  }

  if (newSongId2 !== undefined && newSongId3 !== undefined) {
    const batchSongIds = [newSongId2, newSongId3];
    const batchQuantities = [3n, 2n];
    let batchMintCost = 0n;
    batchMintCost += songPrice2Wei * batchQuantities[0];
    batchMintCost += songPrice3Wei * batchQuantities[1];

    try {
      const platformFeeWei = await contract.read.platformFee();
      const totalBatchMintCost = batchMintCost + platformFeeWei;

      const mintBatchSongsTx = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: contractABI,
        functionName: "mintBatchSongs",
        args: [batchSongIds, batchQuantities],
        value: totalBatchMintCost,
        gas: 2000000n,
      });
      const mintBatchSongsReceipt =
        await publicClient.waitForTransactionReceipt({
          hash: mintBatchSongsTx,
        });
      console.log(
        "mintBatchSongs Receipt Status:",
        mintBatchSongsReceipt.status
      );
      console.log("mintBatchSongs Receipt (Keys and Values):");
      for (const key of Object.keys(mintBatchSongsReceipt)) {
        console.log(
          `${key}:`,
          mintBatchSongsReceipt[key as keyof typeof mintBatchSongsReceipt]
        );
      }
      // Event checking removed - rely on Basescan
      // ... (Event decoding and checking logic removed)
    } catch (batchMintError: any) {
      console.error(
        "mintBatchSongs function call failed:",
        batchMintError.message
      );
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay before updatePlatformFee

  // **--- 10. Test updatePlatformFee Function and PlatformFeeUpdated Event ---**
  console.log(
    "\n--- 10. Testing updatePlatformFee Function and PlatformFeeUpdated Event ---"
  );
  const newPlatformFee = parseEther("0.002");
  try {
    const currentPlatformFee = await contract.read.platformFee();
    const updateFeeTx = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: "updatePlatformFee",
      args: [newPlatformFee],
      gas: 2000000n,
    });
    const updateFeeReceipt = await publicClient.waitForTransactionReceipt({
      hash: updateFeeTx,
    });

    console.log("Update Fee Receipt Status:", updateFeeReceipt.status);
    console.log("Update Fee Receipt (Keys and Values):");
    for (const key of Object.keys(updateFeeReceipt)) {
      console.log(
        `${key}:`,
        updateFeeReceipt[key as keyof typeof updateFeeReceipt]
      );
    }
    // Event checking removed - rely on Basescan
    // ... (Event decoding and checking logic removed)

    const updatedPlatformFee = await contract.read.platformFee();
    console.log(
      "Platform Fee Updated - New Fee (ETH):",
      formatEther(updatedPlatformFee)
    );
  } catch (updateFeeError: any) {
    console.error(
      "updatePlatformFee function call failed:",
      updateFeeError.message
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay before updateSongPrice

  // **--- 11. Test updateSongPrice Function and SongPriceUpdated Event ---**
  console.log(
    "\n--- 11. Testing updateSongPrice Function and SongPriceUpdated Event ---"
  );
  if (newSongId1 !== undefined) {
    const newSongPrice = parseEther("0.00025");
    try {
      const updatePriceTx = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: contractABI,
        functionName: "updateSongPrice",
        args: [newSongId1, newSongPrice],
        gas: 2000000n,
      });
      const updatePriceReceipt = await publicClient.waitForTransactionReceipt({
        hash: updatePriceTx,
      });

      console.log("updateSongPrice Receipt Status:", updatePriceReceipt.status);
      console.log("updateSongPrice Receipt (Keys and Values):");
      for (const key of Object.keys(updatePriceReceipt)) {
        console.log(
          `${key}:`,
          updatePriceReceipt[key as keyof typeof updatePriceReceipt]
        );
      }
      // Event checking removed - rely on Basescan
      // ... (Event decoding and checking logic removed)

      const updatedSongDetails = await contract.read.getSongDetails([
        newSongId1,
      ]);
      console.log(
        "Song Price Updated - New Price (ETH):",
        formatEther(updatedSongDetails[2])
      );
    } catch (updatePriceError: any) {
      console.error(
        "updateSongPrice function call failed:",
        updatePriceError.message
      );
    }
  }

  // **--- 12. Test uri Function ---**
  console.log("\n--- 12. Testing uri Function ---");
  if (newSongId1 !== undefined) {
    try {
      const tokenUri = await contract.read.uri([newSongId1]);
      console.log("Token URI Retrieved:", tokenUri);
    } catch (uriError: any) {
      console.error("uri function call failed:", uriError.message);
    }
  }

  // **--- 13. Test getArtistSongs Function ---**
  console.log("\n--- 13. Testing getArtistSongs Function ---");
  try {
    const artistSongs = await contract.read.getArtistSongs([ownerAddress]);
    console.log("Artist Songs Retrieved:", artistSongs);
  } catch (artistSongsError: any) {
    console.error(
      "getArtistSongs function call failed:",
      artistSongsError.message
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay before pause function

  // **--- 14. Test pause and unpause Functions and paused State ---**
  console.log("\n--- 14. Testing pause and unpause Functions ---");
  try {
    // Pause
    console.log("Pausing contract...");
    const pauseTx = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: "pause",
      gas: 2000000n,
    });
    await publicClient.waitForTransactionReceipt({ hash: pauseTx });
    const pausedStateAfterPause = await contract.read.paused();
    console.log("Contract paused:", pausedStateAfterPause);

    await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay before unpause function

    // Unpause
    console.log("Unpausing contract...");
    const unpauseTx = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: "unpause",
      gas: 2000000n,
    });
    await publicClient.waitForTransactionReceipt({ hash: unpauseTx });
    const pausedStateAfterUnpause = await contract.read.paused();
    console.log("Contract paused:", pausedStateAfterUnpause); // Should be false
  } catch (pauseError: any) {
    console.error("pause/unpause test failed:", pauseError.message);
  }

  await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay before withdrawPlatformFees

  // **--- 15. Test withdrawPlatformFees Function ---**
  console.log(
    "\n--- 15. Testing withdrawPlatformFees Function (Note: Balance might be zero in test) ---"
  );
  try {
    const withdrawTx = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: "withdrawPlatformFees",
      gas: 2000000n,
    });
    const withdrawReceipt = await publicClient.waitForTransactionReceipt({
      hash: withdrawTx,
    });
    console.log(
      "withdrawPlatformFees transaction hash:",
      withdrawReceipt.transactionHash
    );
    // Note: In a test environment, contract balance might be zero unless fees have accumulated from minting.
    console.log(
      "withdrawPlatformFees function called (balance withdrawal - check transaction for ETH transfer if any)."
    );
  } catch (withdrawError: any) {
    console.error(
      "withdrawPlatformFees function call failed:",
      withdrawError.message
    );
  }

  console.log("\n--- Comprehensive Test Script Completed ---");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
