import { useReadContract, useReadContracts } from "wagmi";
import { EveDEX } from "../contracts";
import { convertCallsResult, getContractCalls } from "../helpers";
import { Instrument } from "../helpers/event-horizon-types";

const contractConfig = {
  abi: EveDEX.abi,
  address: EveDEX.address,
};

const useInstruments = () => {
  const {
    data: instrumentsLengthData,
    isLoading: isLoadingInstrumentsLength,
  } = useReadContract({
    ...contractConfig,
    functionName: "instrumentsLength",
  });

  const instrumentsLength: number = instrumentsLengthData || 0;

  const calls = [];

  for (let i = 0; i < instrumentsLength; i++) {
    calls.push({
      key: i.toString(),
      functionName: "getInstrumentData",
      args: [i],
    });
  }

  const contractCalls = getContractCalls(calls, contractConfig);

  const { data, isLoading } = useReadContracts({
    contracts: contractCalls,
    query: {
      enabled: instrumentsLength > 0,
    },
  });

  const instruments = convertCallsResult(calls, data) as {
    [x: number]: Instrument;
  };

  return {
    instruments: instruments,
    isLoading: isLoading || isLoadingInstrumentsLength,
  };
};

export default useInstruments;
