import { useWriteContract } from "wagmi";

import useAccounts from "./useAccounts";
import { Btc, EveDEX, Usdt } from "../contracts";
import { OrderExtended } from "../helpers/event-horizon-types";
import { useState } from "react";
import usePrices from "./usePrices";
import { BTC_USD_INDEX } from "../constants";

const useFillOrders = () => {
  const { matcher } = useAccounts();
  const { writeContractAsync } = useWriteContract();
  const { BTC: BTC_PRICE, USDT: USDT_PRICE } = usePrices();

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fillOrders = async (
    buyOrder: OrderExtended,
    sellOrder: OrderExtended
  ) => {
    try {
      setIsLoading(true);

      const fullPrices = {
        instrumentPrices: [
          {
            index: BTC_USD_INDEX,
            price: BTC_PRICE,
          },
        ],
        collateralPrices: [
          {
            collateral: Usdt.address,
            price: USDT_PRICE,
          },
          {
            collateral: Btc.address,
            price: BTC_PRICE,
          },
        ],
      };

      const historyTimestamp = Math.trunc(Date.now() / 1000);
      const historySearchHint = 0n; // element index in funding rate array. Hint from backend to reduce tx gas cost

      const tx = await writeContractAsync({
        abi: EveDEX.abi,
        address: EveDEX.address,
        functionName: "fillOrders",
        account: matcher.wallet,
        args: [
          buyOrder,
          sellOrder,
          BTC_PRICE,
          buyOrder.order.amount,
          fullPrices,
          historyTimestamp,
          historySearchHint,
        ],
      });

      setIsLoading(false);

      return tx;
    } catch (e) {
      setIsLoading(false);
      throw e;
    }
  };

  return { fillOrders, isLoading };
};

export default useFillOrders;
