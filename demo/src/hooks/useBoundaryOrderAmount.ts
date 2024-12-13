import { useReadContract } from "wagmi";
import { Address } from "viem";

import { EveDEX } from "../contracts";

import { INT_PRECISION_EVEDEX } from "../constants";

import useMarginLevel from "./useMarginLevel";

const useBoundaryOrderAmount = (
  instrumentPrices: any,
  instrumentIndex: number,
  collateralPrices: any,
  leverage: bigint
) => {
  const { equity, margin } = useMarginLevel(instrumentPrices, collateralPrices);

  const { data } = useReadContract({
    functionName: "soLevel",
    address: EveDEX.address as Address,
    abi: EveDEX.abi,
    args: [],
  });
  const soLevel: bigint = (data as bigint) || 0n;
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
