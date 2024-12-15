import React from "react";

import { Btc, Usdt } from "../../contracts";
import { Address, PrivateKeyAccount } from "viem";
import { useBalance } from "../../hooks";

type BalanceProps = {
  address: Address;
  account: PrivateKeyAccount;
};

const Balance: React.FC<BalanceProps> = ({ address, account }) => {
  const { formatted, token, isLoading } = useBalance(address, account.address!);
  return isLoading ? (
    "Loading..."
  ) : (
    <div>
      {token.name}: {formatted} {token.symbol}
    </div>
  );
};

type BalancesProps = {
  account: PrivateKeyAccount;
};

const Balances: React.FC<BalancesProps> = ({ account }) => {
  const tokens = [Usdt.address, Btc.address];
  return (
    <div>
      <h4>Wallet Balances</h4>
      {tokens.map((address) => (
        <Balance key={address} address={address as Address} account={account} />
      ))}
    </div>
  );
};

export default Balances;
