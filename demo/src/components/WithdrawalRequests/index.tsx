import React from "react";
import { Address, formatUnits, Hash } from "viem";
import {
  RequestStatus,
  WithdrawalRequestContract,
  WithdrawalRequestExtended,
  WithdrawalRequest as WithdrawalRequestType,
} from "../../helpers/event-horizon-types";
import { useMatcherState } from "../../providers/MatcherProvider";
import { useToken } from "../../hooks";

import Collapse from "../Collapse";
import Button from "../Button";
import useWithdrawComplete from "../../hooks/useWithdrawComplete";
import useAccounts from "../../hooks/useAccounts";
import { toast } from "react-toastify";
import { convertCallsResult, getContractCalls } from "../../helpers";
import { DepositDEX } from "../../contracts";
import { useReadContracts } from "wagmi";
import { getWithdrawalRequestHash } from "../../helpers/contract-data-helpers";
import { CallConfig } from "../../interfaces";

const WithdrawalRequest: React.FC<{ request: WithdrawalRequestExtended }> = ({
  request,
}) => {
  const { matcher } = useAccounts();
  const { symbol, decimals } = useToken(request.collateral);
  const { withdrawComplete, isLoading } = useWithdrawComplete();
  const onConfirm = async () => {
    try {
      const tx = await withdrawComplete(request, matcher.wallet);
      toast.success(`Withdrawal request confirmed. ${tx}`);
    } catch (e) {
      toast.error(`Error: ${(e as any).message}`);
      console.error(e);
    }
  };
  const isCanceled = request.status === RequestStatus.Cancelled;
  const isCompleted = request.status === RequestStatus.Completed;
  const isExpired = request.expiration * 1000 < Date.now();
  const isDisabled = isCanceled || isCompleted || isExpired;
  const buttonText = isCanceled
    ? "Canceled"
    : isCompleted
    ? "Completed"
    : isExpired
    ? "Expired"
    : "Confirm";
  return (
    <>
      <div className="withdraw-request">
        <div>
          {formatUnits(request.amount, decimals)} {symbol} until{" "}
          {new Date(request.expiration * 1000).toString()}
        </div>
        <Button disabled={isDisabled} onClick={onConfirm} isLoading={isLoading}>
          {buttonText}
        </Button>
      </div>
    </>
  );
};

const useWithdrawRequests = (address: Address) => {
  const { withdrawalRequests } = useMatcherState();
  const requests = withdrawalRequests[address] || [];
  const mappedRequests: { [hash: Hash]: WithdrawalRequestType } = {};

  const calls: CallConfig[] = [];

  requests.forEach((request) => {
    const hash = getWithdrawalRequestHash(request);
    mappedRequests[hash] = request;

    calls.push(
      {
        key: hash,
        functionName: "getWithdrawRequest",
        args: [hash],
      },
      {
        key: `${hash}-gen`,
        functionName: "getWithdrawOrderHash",
        args: [request],
      }
    );
  });

  const contractCalls = getContractCalls(calls, {
    abi: DepositDEX.abi,
    address: DepositDEX.address,
  });

  const { data, isLoading } = useReadContracts({
    contracts: contractCalls,
    query: {
      enabled: !!address && requests.length > 0,
    },
  });

  const contractsRequests = convertCallsResult(calls, data) as {
    [hash: Hash]: WithdrawalRequestContract;
  };

  const extendedRequests: WithdrawalRequestExtended[] = [];

  Object.keys(mappedRequests).map((key) => {
    const hash = key as Hash;
    const mappedRequest = mappedRequests[hash];
    const contractRequest: WithdrawalRequestContract =
      contractsRequests[hash as Hash];

    if (
      contractRequest &&
      contractRequest.status !== RequestStatus.NotCreated
    ) {
      extendedRequests.push({
        ...mappedRequest,
        ...contractRequest,
        hash,
      });
    }
  });

  return {
    requests: extendedRequests,
    isLoading,
  };
};

type UserWithdrawalRequestsProps = {
  address: Address;
};

const UserWithdrawalRequests: React.FC<UserWithdrawalRequestsProps> = ({
  address,
}) => {
  const { requests, isLoading } = useWithdrawRequests(address);
  if (!Object.keys(requests).length) return null;
  return (
    <div>
      <h5>{address}</h5>
      <div>{isLoading && "Loading..."}</div>
      <div>
        {requests.map((request) => {
          return <WithdrawalRequest key={request.hash} request={request} />;
        })}
      </div>
    </div>
  );
};

const WithdrawalRequests: React.FC = () => {
  const { withdrawalRequests } = useMatcherState();
  const addresses = Object.keys(withdrawalRequests);
  return (
    <Collapse title="Withdraw requests">
      {!addresses.length ? (
        <div>No requests</div>
      ) : (
        addresses.map((address) => (
          <UserWithdrawalRequests key={address} address={address as Address} />
        ))
      )}
    </Collapse>
  );
};

export default WithdrawalRequests;
