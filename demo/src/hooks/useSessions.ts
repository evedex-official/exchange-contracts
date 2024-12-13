import { useEffect } from "react";
import {
  useAccount,
  useReadContract,
  useBlockNumber,
  useReadContracts,
} from "wagmi";
import { AbiItem, Address } from "viem";

import { SessionManager } from "../contracts";
import { convertCallsResult, getContractCalls } from "../helpers";
import { CallConfig } from "../interfaces";

const useSession = () => {
  const { address } = useAccount();
  const {
    data: sessions,
    isLoading: isLoadingSessions,
    refetch: refetchSessions,
  } = useReadContract({
    functionName: "getSessions",
    address: SessionManager.address as Address,
    abi: SessionManager.abi,
    args: [address],
  });

  // const {
  //   data: sessionsLength,
  //   isLoading: isLoadingSessionsLength,
  //   refetch: refetchSessionsLength,
  // } = useReadContract({
  //   functionName: "getSessions",
  //   address: SessionManager.address as Address,
  //   abi: SessionManager.abi,
  //   args: [address],
  // });

  let calls: CallConfig[] = [];

  ((sessions as Address[]) || []).forEach((session) => {
    calls.push({
      key: session,
      functionName: "getSessionData",
      args: [session],
    } as CallConfig);
  });

  const contractCalls = getContractCalls(calls, {
    abi: SessionManager.abi as AbiItem[],
    address: SessionManager.address,
  });

  const { data, isLoading: isLoadingSessionsData } = useReadContracts({
    contracts: contractCalls,
    query: {
      enabled: typeof sessions !== "undefined",
    },
  });

  const sessionsData = convertCallsResult(calls, data);

  const { data: blockNumber } = useBlockNumber({ watch: true });

  useEffect(() => {
    refetchSessions();
  }, [blockNumber]);

  const isLoading = isLoadingSessionsData || isLoadingSessions;

  return { data: sessionsData, isLoading };
};

export default useSession;
