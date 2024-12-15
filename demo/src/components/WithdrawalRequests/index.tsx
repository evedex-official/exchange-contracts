import React from "react";
import { useMatcherState } from "../../providers/MatcherProvider";
import Collapse from "../Collapse";

const WithdrawalRequests: React.FC = () => {
  const { withdrawalRequests } = useMatcherState();
  return (
    <Collapse title="Withdraw requests">
      <pre>{JSON.stringify(withdrawalRequests, null, 2)}</pre>
    </Collapse>
  );
};

export default WithdrawalRequests;
