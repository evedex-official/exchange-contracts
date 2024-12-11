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
    acc[callConfig.key] = callConfig.defaultValue;
    if (data) {
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
