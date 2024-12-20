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
  { tokenDecimals = 0n } = {}
): bigint => {
  return parseUnits(price.toString(), Number(tokenDecimals));
};

export const formatPrice = (price: bigint, { tokenDecimals = 0 } = {}) => {
  return formatUnits(price, tokenDecimals);
};

export const getRandom = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};
