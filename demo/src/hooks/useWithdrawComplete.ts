import { useWriteContract } from "wagmi";
import { PrivateKeyAccount } from "viem";
import { useState } from "react";

import { WithdrawalRequest } from "../helpers/event-horizon-types";
import { DepositDEX } from "../contracts";
import { useInstrumentsPrices } from "./useInstruments";
import { useCollateralsPrices } from "./useCollaterals";

const useWithdrawComplete = () => {
  const instrumentPrices = useInstrumentsPrices();
  const collateralPrices = useCollateralsPrices();
  const { writeContractAsync } = useWriteContract();
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const historyTimestamp = Math.trunc(Date.now() / 1000);
  const historySearchHint = 0n; // element index in funding rate array. Hint from backend to reduce tx gas cost

  const fullPrices = {
    instrumentPrices,
    collateralPrices,
  };

  const withdrawComplete = async (
    request: WithdrawalRequest,
    account: PrivateKeyAccount
  ) => {
    try {
      setIsLoading(true);
      const tx = await writeContractAsync({
        account,
        functionName: "withdrawComplete",
        address: DepositDEX.address,
        abi: DepositDEX.abi,
        args: [request, fullPrices, historyTimestamp, historySearchHint],
      });
      setIsLoading(false);
      return tx;
    } catch (e) {
      setIsLoading(false);
      throw e;
    }
  };

  return {
    withdrawComplete,
    isLoading,
  };
};

export default useWithdrawComplete;
