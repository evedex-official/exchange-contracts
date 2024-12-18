import { Collateral } from "../helpers/event-horizon-types";
import useDepositDex from "./useDepositDex";
import usePrices from "./usePrices";

const useCollaterals = () => {
  const { data, isLoading } = useDepositDex();
  return {
    collaterals: data.collaterals || [],
    isLoading: isLoading,
  };
};

export default useCollaterals;

export const useCollateralsPrices = () => {
  const { collaterals } = useCollaterals();
  const prices = usePrices();
  return collaterals.map((c: Collateral) => ({
    collateral: c.address,
    price: (prices[c.address] as bigint) || 0n,
  }));
};
