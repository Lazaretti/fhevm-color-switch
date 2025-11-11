"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDeployedContractInfo } from "./helper";
import { useWagmiEthers } from "./wagmi/useWagmiEthers";
import { FhevmInstance } from "@fhevm-sdk";
import {
  buildParamsFromAbi,
  getEncryptionMethod,
  useFHEDecrypt,
  useFHEEncryption,
  useInMemoryStorage,
} from "@fhevm-sdk";
import { ethers } from "ethers";
import { useReadContract } from "wagmi";
import type { Contract } from "~~/utils/helper/contract";
import type { AllowedChainIds } from "~~/utils/helper/networks";

/**
 * @hook useFHEColorSwitch
 * @notice React hook to interact with FHEColorSwitch smart contract.
 *         Supports encryption, on-chain submission, and off-chain decryption
 *         of private Color Switch game scores.
 */
export const useFHEColorSwitch = (args: {
  instance: FhevmInstance | undefined;
  initialMockChains?: Readonly<Record<number, string>>;
}) => {
  const { instance, initialMockChains } = args;
  const { storage: decSigStore } = useInMemoryStorage();
  const { chainId, accounts, isConnected, ethersReadonlyProvider, ethersSigner } = useWagmiEthers(initialMockChains);

  const activeChain = typeof chainId === "number" ? (chainId as AllowedChainIds) : undefined;
  const { data: csContract } = useDeployedContractInfo({
    contractName: "FHEColorSwitch",
    chainId: activeChain,
  });

  type CSContractInfo = Contract<"FHEColorSwitch"> & { chainId?: number };

  const [statusMsg, setStatusMsg] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const hasContract = Boolean(csContract?.address && csContract?.abi);
  const hasSigner = Boolean(ethersSigner);
  const hasProvider = Boolean(ethersReadonlyProvider);

  const getCSContract = (mode: "read" | "write") => {
    if (!hasContract) return undefined;
    const provOrSigner = mode === "read" ? ethersReadonlyProvider : ethersSigner;
    if (!provOrSigner) return undefined;
    return new ethers.Contract(csContract!.address, (csContract as CSContractInfo).abi, provOrSigner);
  };

  // Fetch encrypted score history
  const { data: scoreData, refetch: refreshScores } = useReadContract({
    address: hasContract ? (csContract!.address as `0x${string}`) : undefined,
    abi: hasContract ? ((csContract as CSContractInfo).abi as any) : undefined,
    functionName: "viewEncryptedScores",
    args: [accounts ? accounts[0] : ""],
    query: { enabled: Boolean(hasContract && hasProvider), refetchOnWindowFocus: false },
  });

  // Prepare decrypt requests
  const decryptRequests = useMemo(() => {
    if (!scoreData || !Array.isArray(scoreData)) return undefined;
    return scoreData.map(item => ({
      handle: item,
      contractAddress: csContract!.address,
    }));
  }, [scoreData, csContract?.address]);

  // FHE decrypt hook
  const {
    canDecrypt: canDecryptScores,
    decrypt: decryptScores,
    isDecrypting: isDecryptingScores,
    message: decryptMsg,
    results: decryptedScores,
  } = useFHEDecrypt({
    instance,
    ethersSigner: ethersSigner as any,
    fhevmDecryptionSignatureStorage: decSigStore,
    chainId,
    requests: decryptRequests,
  });

  useEffect(() => {
    if (decryptMsg) setStatusMsg(decryptMsg);
  }, [decryptMsg]);

  // FHE encryption hook
  const { encryptWith } = useFHEEncryption({
    instance,
    ethersSigner: ethersSigner as any,
    contractAddress: csContract?.address,
  });

  const canSubmit = useMemo(
    () => Boolean(hasContract && instance && hasSigner && !isBusy),
    [hasContract, instance, hasSigner, isBusy],
  );

  const getEncryptionMethodFor = (fnName: "addEncryptedScore") => {
    const fnAbi = csContract?.abi.find(item => item.type === "function" && item.name === fnName);
    if (!fnAbi) return { method: undefined as string | undefined, error: `No ABI for ${fnName}` };
    if (!fnAbi.inputs || fnAbi.inputs.length === 0)
      return { method: undefined as string | undefined, error: `No inputs for ${fnName}` };
    return { method: getEncryptionMethod(fnAbi.inputs[0].internalType), error: undefined };
  };

  // Submit encrypted score
  const submitScore = useCallback(
    async (scoreValue: number) => {
      if (isBusy || !canSubmit) return;
      setIsBusy(true);
      setStatusMsg(`Submitting encrypted score (${scoreValue})...`);
      try {
        const { method, error } = getEncryptionMethodFor("addEncryptedScore");
        if (!method) return setStatusMsg(error ?? "Encryption method missing");
        setStatusMsg(`Encrypting score with ${method}...`);
        const encData = await encryptWith(builder => {
          (builder as any)[method](scoreValue);
        });
        if (!encData) return setStatusMsg("Encryption failed");
        const contractWrite = getCSContract("write");
        if (!contractWrite) return setStatusMsg("Contract unavailable or signer missing");
        const params = buildParamsFromAbi(encData, [...csContract!.abi] as any[], "addEncryptedScore");
        const tx = await contractWrite.addEncryptedScore(...params, { gasLimit: 300_000 });
        setStatusMsg("Waiting for transaction confirmation...");
        await tx.wait();
        setStatusMsg(`Score (${scoreValue}) submitted!`);
        await refreshScores();
      } catch (e) {
        setStatusMsg(`submitScore() failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setIsBusy(false);
      }
    },
    [isBusy, canSubmit, encryptWith, getCSContract, refreshScores, csContract?.abi],
  );

  useEffect(() => {
    setStatusMsg("");
  }, [accounts, chainId]);

  return {
    contractAddress: csContract?.address,
    canDecryptScores,
    decryptScores,
    isDecryptingScores,
    decryptedScores,
    scoreData,
    refreshScores,
    submitScore,
    isProcessing: isBusy,
    canSubmit,
    chainId,
    accounts,
    isConnected,
    ethersSigner,
    message: statusMsg,
  };
};
