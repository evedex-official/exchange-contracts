import { Address } from "viem";

import { INT_PRECISION_EVEDEX } from "../constants";

import useEveDex from "./useEveDex";
import useMarginLevel from "./useMarginLevel";

const useBoundaryOrderAmount = (
  address: Address,
  instrumentPrices: any,
  instrumentIndex: number,
  collateralPrices: any,
  leverage: bigint
) => {
  const { data: eveDex, isLoading: isLoadingEveDex } = useEveDex();
  const { data: marginLevel, isLoading: isLoadingMarginLevel } = useMarginLevel(
    address,
    instrumentPrices,
    collateralPrices
  );
  const { soLevel } = eveDex;

  const { equity, margin } = marginLevel as { equity: bigint; margin: bigint };

  const instrumentPrice = instrumentPrices[instrumentIndex].price as bigint;

  // first formula that comes to the head
  // const requiredMargin = (margin * soLevel) / 100n;
  // // Check if equity is sufficient to cover the required margin
  // if (equity <= requiredMargin) {
  //   throw new Error('Insufficient equity to cover required margin');
  // }
  // // Calculate the maximum position size
  // const positionSize = (leverage * (equity - requiredMargin) * INT_PRECISION) / instrumentPrice;
  // return positionSize;

  // formula used in contracts
  const positionSize =
    (leverage *
      (equity * 100n - margin * soLevel - 1n) *
      INT_PRECISION_EVEDEX) /
    (soLevel * instrumentPrice);
  return positionSize;
};

export default useBoundaryOrderAmount;
