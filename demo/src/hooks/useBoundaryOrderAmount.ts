import { useReadContracts } from "wagmi";
import { Address } from "viem";

import { EveDEX } from "../contracts";

import { INT_PRECISION_EVEDEX } from "../constants";

import { CallConfig } from "../interfaces";
import { convertCallsResult, getContractCalls } from "../helpers";

const useBoundaryOrderAmount = (
  address: Address,
  instrumentPrices: any,
  instrumentIndex: number,
  collateralPrices: any,
  leverage: bigint
) => {
  const calls: CallConfig[] = [
    {
      key: "soLevel",
      functionName: "soLevel",
      args: [],
    },
    {
      key: "marginLevel",
      functionName: "calculateMarginLevel",
      args: [
        address,
        instrumentPrices, // Current instrument prices
        collateralPrices, // Current collateral prices
        true, // Check prices flag
        Math.floor(Date.now() / 1000), // Historical timestamp
        0n, // History search hint (optimization for gas)
      ],
      format: (value: any) => {
        const [marginLevel, equity, margin, pnls, frs] = value;
        return { marginLevel, equity, margin, pnls, frs } as {
          marginLevel: bigint;
          equity: bigint;
          margin: bigint;
        };
      },
    },
  ];

  const contractCalls = getContractCalls(calls, {
    address: EveDEX.address,
    abi: EveDEX.abi,
  });

  const { data } = useReadContracts({
    contracts: contractCalls,
  });
  const { soLevel, marginLevel } = convertCallsResult(calls, data);

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
