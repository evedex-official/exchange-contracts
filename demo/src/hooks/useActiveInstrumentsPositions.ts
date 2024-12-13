import { useAccount, useReadContract } from "wagmi";
import { EveDEX } from "../contracts";
import { Address } from "viem";

const useActiveInstrumentsPositions = () => {
  const { address } = useAccount();
  return useReadContract({
    functionName: "getActiveInstrumentsPositions",
    args: [address],
    abi: EveDEX.abi,
    address: EveDEX.address as Address,
  });
};

export default useActiveInstrumentsPositions;
