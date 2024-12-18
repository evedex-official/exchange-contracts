import React from "react";
import { Token } from "../../helpers/event-horizon-types";
import Balance from "./Balance";

type BalancesProps = {
  title: string;
  balances: { value: bigint; token: Token }[];
  isLoading?: boolean;
};

const Balances: React.FC<BalancesProps> = ({ title, balances, isLoading }) => {
  return (
    <div className="balances">
      <h6 className="balances-title">{title}</h6>
      <div className="balances-list">
        {balances.map((balance, index) => (
          <Balance
            key={`${balance.token.address}-${index}`}
            value={balance.value}
            symbol={balance.token.symbol}
            decimals={balance.token.decimals}
            isLoading={isLoading}
          />
        ))}
      </div>
    </div>
  );
};

export default Balances;
