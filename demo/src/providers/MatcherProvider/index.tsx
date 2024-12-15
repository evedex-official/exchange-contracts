import { createContext, useContext, useState } from "react";
import { Address } from "viem";

import { WithdrawalRequest, Order } from "../../interfaces";
import usePersistedState from "../../hooks/usePersistedState";
import { LC_STORAGE_KEY } from "../../constants";

type MatcherStateType = {
  withdrawalRequests: {
    [address: Address]: WithdrawalRequest[];
  };
  orders: {
    [instrument: number]: {
      [side: number]: Order[];
    };
  };
  addWithdrawRequest: (request: WithdrawalRequest, address: Address) => void;
  completeWithdrawRequest: () => void;
  cancelWithdrawRequest: () => void;
  addOrder: (order: any) => void;
  matchOrders: () => void;
};

const MatcherStateContext = createContext<MatcherStateType>({
  withdrawalRequests: {},
  orders: {},
  addWithdrawRequest: () => {},
  completeWithdrawRequest: () => {},
  cancelWithdrawRequest: () => {},
  addOrder: () => {},
  matchOrders: () => {},
});

type MatcherStateProviderProps = {
  children: any;
};

const MatcherStateProvider: React.FC<MatcherStateProviderProps> = ({
  children,
}) => {
  const [orders, setOrders] = usePersistedState<any>({}, LC_STORAGE_KEY.ORDERS);

  const addOrder = (order: any) => {
    setOrders((prevState: any) => ({
      ...prevState,
      [order.instrumentIndex]: {
        ...(prevState[order.instrumentIndex] || {}),
        [order.side]: [
          ...((prevState[order.instrumentIndex] || {})[order.side] || []),
          order,
        ],
      },
    }));
  };

  const [withdrawalRequests, setWithdrawalRequests] = usePersistedState<{
    [address: Address]: WithdrawalRequest[];
  }>({}, LC_STORAGE_KEY.WITHDRAW_REQUESTS);

  const addWithdrawRequest = (request: WithdrawalRequest, address: Address) => {
    console.log(request, address);
    setWithdrawalRequests((prevState) => ({
      ...prevState,
      [address]: [...(prevState[address] || []), request],
    }));
  };
  const completeWithdrawRequest = () => {};
  const cancelWithdrawRequest = () => {};

  const value = {
    withdrawalRequests,
    addWithdrawRequest,
    completeWithdrawRequest,
    cancelWithdrawRequest,
    orders: orders,
    addOrder,
    matchOrders: () => {},
  };
  return (
    <MatcherStateContext.Provider value={value}>
      {children}
    </MatcherStateContext.Provider>
  );
};

export default MatcherStateProvider;

export const useMatcherState = () => useContext(MatcherStateContext);
