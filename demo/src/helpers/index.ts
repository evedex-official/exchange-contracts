import { formatUnits, parseUnits } from "viem";
import { CallConfig, ContractConfig } from "../interfaces";

export const getContractCalls = (
  calls: CallConfig[],
  contractConfig: ContractConfig & { chainId?: any }
) => {
  return calls.map((call) => ({
    ...contractConfig,
    functionName: call.functionName,
    args: call.args || undefined,
  }));
};

export const convertCallsResult = (
  calls: CallConfig[],
  data:
    | (
        | {
            error: Error;
            result?: undefined;
            status: "failure";
          }
        | {
            error?: undefined;
            result: unknown;
            status: "success";
          }
      )[]
    | undefined
) => {
  return calls.reduce((acc, callConfig, index) => {
    if (typeof callConfig.defaultValue !== "undefined") {
      acc[callConfig.key] = callConfig.defaultValue;
    }
    if (typeof data !== "undefined") {
      const call = data[index];
      if (call.status === "success") {
        acc[callConfig.key] = callConfig.format
          ? callConfig.format(call.result)
          : call.result;
      }
    }

    return acc;
  }, {} as { [x: string]: any });
};

export const parsePrice = (
  price: number,
  { precisionDecimals = 8n, tokenDecimals = 0n } = {}
): bigint => {
  const priceShifted = BigInt(
    Math.round(price * Number(10n ** precisionDecimals))
  );
  return (priceShifted * 10n ** precisionDecimals) / 10n ** tokenDecimals;
};

export const formatPrice = (
  price: bigint,
  { precisionDecimals = 8n, tokenDecimals = 0n } = {}
) => {
  const priceShifted =
    (price * 10n ** tokenDecimals) / 10n ** precisionDecimals;
  return (priceShifted / 10n ** precisionDecimals).toString();
};

export const getRandom = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};
