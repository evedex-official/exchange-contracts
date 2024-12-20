import { useChainId, useSignTypedData, useWriteContract } from "wagmi";
import useAccounts from "./useAccounts";
import { EveDEX } from "../contracts";
import { domain, multiOrderLiquidationTypes } from "../helpers/eip721-types";
import usePrices from "./usePrices";
import useCollaterals from "./useCollaterals";
import { createMultiLiquidationOrder } from "../helpers/contract-data-helpers";
import {
  Collateral,
  Order,
  OrderExtended,
} from "../helpers/event-horizon-types";
import useInstruments, { useInstrumentsPrices } from "./useInstruments";
import { Address } from "viem";
import { useState } from "react";

const useLiquidator = () => {
  const chainId = useChainId();
  const [isLiquidating, setIsLiquidating] = useState<boolean>(false);
  const { liquidator, matcher } = useAccounts();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();

  const prices = usePrices();
  const { collaterals } = useCollaterals();

  const currentInstrumentPrices = useInstrumentsPrices();

  const currentCollateralPrices = collaterals.map((c: Collateral) => ({
    collateral: c.address,
    price: prices[c.address],
  }));

  const signMultiLiquidationOrder = async (
    accountToLiquidate: Address,
    collateral: Collateral
  ) => {
    const multiLiquidationOrder = createMultiLiquidationOrder({
      accountToLiquidate,
      liquidator: liquidator.wallet.address,
      collateral: collateral.address,
      liquidationPrices: currentInstrumentPrices,
      prices: currentInstrumentPrices,
      leverage: 1n,
    });

    const signature = await signTypedDataAsync({
      message: multiLiquidationOrder,
      types: multiOrderLiquidationTypes,
      domain: domain(EveDEX.address, chainId),
      primaryType: "MultiOrderLiquidation",
      account: liquidator.wallet,
    });

    multiLiquidationOrder.signature = signature;

    return multiLiquidationOrder;
  };

  const liquidate = async (
    accountToLiquidate: Address,
    collateral: Collateral
  ) => {
    try {
      setIsLiquidating(true);
      const signedMultiliquidationOrder = await signMultiLiquidationOrder(
        accountToLiquidate,
        collateral
      );

      const tx = await writeContractAsync({
        functionName: "liquidatePositions",
        address: EveDEX.address,
        abi: EveDEX.abi,
        args: [
          signedMultiliquidationOrder,
          {
            collateralPrices: currentCollateralPrices,
            instrumentPrices: currentInstrumentPrices,
          },
          collateral.index,
          Math.trunc(Date.now() / 1000), // history timestamp
          0n, // history search hint
        ],
        account: matcher.wallet,
      });
      setIsLiquidating(false);
      return tx;
    } catch (e) {
      setIsLiquidating(false);
      throw e;
    }
  };

  return {
    liquidate,
    isLiquidating,
  };
};

export default useLiquidator;
