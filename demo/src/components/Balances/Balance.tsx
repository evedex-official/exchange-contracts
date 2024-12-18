import React from "react";
import { formatUnits } from "viem";

import "./Balance.css";

type BalanceProps = {
  isLoading?: boolean;
  decimals: number;
  value: bigint;
  symbol: string;
};

const Balance: React.FC<BalanceProps> = ({
  isLoading,
  decimals = 18,
  value,
  symbol,
}) => {
  return (
    <div className="balance">
      {isLoading ? (
        "Loading..."
      ) : (
        <>
          <div className="balance-value">{formatUnits(value, decimals)}</div>
          <div className="balance-symbol">{symbol}</div>
        </>
      )}
    </div>
  );
};

export default Balance;
