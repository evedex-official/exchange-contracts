import React from "react";
import { Address, formatUnits } from "viem";
import { WithdrawalRequest as WithdrawalRequestType } from "../../interfaces";
import { useMatcherState } from "../../providers/MatcherProvider";
import { useToken } from "../../hooks";

import Collapse from "../Collapse";
import Button from "../Button";
import useWithdrawComplete from "../../hooks/useWithdraw";
import useAccounts from "../../hooks/useAccounts";
import { toast } from "react-toastify";

const WithdrawalRequest: React.FC<{ request: WithdrawalRequestType }> = ({
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
  const isExpired = request.expiration * 1000 < Date.now();
  return (
    <div className="withdraw-request">
      <div>
        {formatUnits(request.amount, decimals)} {symbol} until{" "}
        {new Date(request.expiration * 1000).toString()}
      </div>
      <Button disabled={isExpired} onClick={onConfirm} isLoading={isLoading}>
        {isExpired ? "Expired" : "Confirm"}
      </Button>
    </div>
  );
};

type UserWithdrawalRequestsProps = {
  address: Address;
  requests: WithdrawalRequestType[];
};

const UserWithdrawalRequests: React.FC<UserWithdrawalRequestsProps> = ({
  address,
  requests,
}) => {
  return (
    <div>
      <h5>{address}</h5>
      <div>
        {requests.map((req) => (
          <WithdrawalRequest key={req.signature} request={req} />
        ))}
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
          <UserWithdrawalRequests
            key={address}
            address={address as Address}
            requests={withdrawalRequests[address as Address]}
          />
        ))
      )}
    </Collapse>
  );
};

export default WithdrawalRequests;
