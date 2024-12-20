import { createContext, useContext, useState } from "react";
import { Address } from "viem";

import { WithdrawalRequest, Order } from "../../interfaces";
import usePersistedState from "../../hooks/usePersistedState";
import { LC_STORAGE_KEY } from "../../constants";
import { OrderExtended } from "../../helpers/event-horizon-types";

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
  addOrder: (order: OrderExtended) => void;
  removeOrder: (order: OrderExtended) => void;
  matchOrders: () => void;
};

const MatcherStateContext = createContext<MatcherStateType>({
  withdrawalRequests: {},
  orders: {},
  addWithdrawRequest: () => {},
  completeWithdrawRequest: () => {},
  cancelWithdrawRequest: () => {},
  addOrder: () => {},
  removeOrder: () => {},
  matchOrders: () => {},
});

type MatcherStateProviderProps = {
  children: any;
};

const MatcherStateProvider: React.FC<MatcherStateProviderProps> = ({
  children,
}) => {
  const [orders, setOrders] = usePersistedState<any>({}, LC_STORAGE_KEY.ORDERS);

  const addOrder = (orderExtended: OrderExtended) => {
    const { order } = orderExtended;
    setOrders((prevState: any) => ({
      ...prevState,
      [order.instrumentIndex]: {
        ...(prevState[order.instrumentIndex] || {}),
        [order.side]: [
          ...((prevState[order.instrumentIndex] || {})[order.side] || []),
          orderExtended,
        ],
      },
    }));
  };

  const removeOrder = (orderExtended: OrderExtended) => {
    const { order } = orderExtended;

    setOrders((prevState: any) => ({
      ...prevState,
      [order.instrumentIndex]: {
        ...(prevState[order.instrumentIndex] || {}),
        [order.side]: (
          (prevState[order.instrumentIndex] || {})[order.side] || []
        ).filter((o: OrderExtended) => o.order.orderId !== order.orderId),
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
    removeOrder,
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
