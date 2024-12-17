import { useWriteContract } from "wagmi";
import { PrivateKeyAccount } from "viem";
import { useState } from "react";

import { WithdrawalRequest } from "../helpers/event-horizon-types";
import { Btc, DepositDEX, Usdt } from "../contracts";
import { BTC_USD_INDEX } from "../constants";

import usePrices from "./usePrices";

const useWithdrawComplete = () => {
  const prices = usePrices();
  const { writeContractAsync } = useWriteContract();
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const historyTimestamp = Math.trunc(Date.now() / 1000);
  const historySearchHint = 0n; // element index in funding rate array. Hint from backend to reduce tx gas cost

  const fullPrices = {
    instrumentPrices: [
      {
        index: BTC_USD_INDEX,
        price: prices[Btc.address],
      },
    ],
    collateralPrices: [
      {
        collateral: Usdt.address,
        price: prices[Usdt.address],
      },
      {
        collateral: Btc.address,
        price: prices[Btc.address],
      },
    ],
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
