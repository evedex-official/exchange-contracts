import { useWriteContract } from "wagmi";

import useAccounts from "./useAccounts";
import { Btc, EveDEX, Usdt } from "../contracts";
import { OrderExtended } from "../helpers/event-horizon-types";
import { useState } from "react";
import usePrices from "./usePrices";
import { useInstrumentsPrices } from "./useInstruments";
import { useCollateralsPrices } from "./useCollaterals";

const useFillOrders = () => {
  const { matcher } = useAccounts();
  const instrumentsPrices = useInstrumentsPrices();
  const collateralPrices = useCollateralsPrices();
  const { writeContractAsync } = useWriteContract();

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fillOrders = async (
    buyOrder: OrderExtended,
    sellOrder: OrderExtended,
    instrumentIndex: number
  ) => {
    try {
      setIsLoading(true);

      const fullPrices = {
        instrumentPrices: instrumentsPrices,
        collateralPrices: collateralPrices,
      };

      const historyTimestamp = Math.trunc(Date.now() / 1000);
      const historySearchHint = 0n; // element index in funding rate array. Hint from backend to reduce tx gas cost

      const fillAmount =
        buyOrder.order.amount < sellOrder.order.amount
          ? buyOrder.order.amount
          : sellOrder.order.amount;
      const instrument = instrumentsPrices.find(
        (i) => i.index == instrumentIndex
      );
      const instrumentPrice = instrument?.price;

      if (!instrumentPrice) throw new Error("Instrument price not found");

      const args = {
        abi: EveDEX.abi,
        address: EveDEX.address,
        functionName: "fillOrders",
        account: matcher.wallet,
        args: [
          buyOrder,
          sellOrder,
          instrumentPrice,
          fillAmount,
          fullPrices,
          historyTimestamp,
          historySearchHint,
        ],
      };

      console.log("args", args);

      const tx = await writeContractAsync(args);

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
