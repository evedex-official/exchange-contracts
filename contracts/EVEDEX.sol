// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {BaseDEX, FundingRateInfo} from "./base/BaseDEX.sol";
import "./interfaces/IEVEDEX.sol";

contract EVEDEX is BaseDEX, IEVEDEX {
  using EnumerableSet for EnumerableSet.UintSet;
  using EnumerableSet for EnumerableSet.AddressSet;

  constructor() {}

  function initialize(
    address initialOwner_,
    address depositDex_,
    address sessionManager_,
    address fundingRateAccount_,
    uint256 maxOpenPositions_,
    int112 soLevel_,
    int112 withdrawMarginLevel_,
    uint112 liquidationFeePercent_
  ) external initializer {
    __BaseDEX_init(
      initialOwner_,
      depositDex_,
      sessionManager_,
      fundingRateAccount_,
      maxOpenPositions_,
      soLevel_,
      withdrawMarginLevel_,
      liquidationFeePercent_
    );
  }

  function getActiveInstrumentsIndexes(address account) public view returns (uint256[] memory) {
    return _activeInstruments[account].values();
  }

  function getActiveInstrumentsPositions(
    address account
  ) public view returns (uint256[] memory indexes, PositionInfo[] memory positions) {
    indexes = _activeInstruments[account].values();
    uint256 indexesLen = indexes.length;
    positions = new PositionInfo[](indexesLen);
    for (uint i = 0; i < indexesLen; ++i) {
      positions[i] = positionInfo[indexes[i]][account];
    }
  }

  function getTotalShortFR(
    uint256 index,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view override returns (int72) {
    FundingRateInfo memory fundingRateInfo = _getFundingRateInfo(index, historyTimestamp, historySearchHint);
    // return
    //   fundingRateInfo.shortFRStored +
    //   int72(uint72(historyTimestamp - fundingRateInfo.lastFRUpdateTime)) *
    //   fundingRateInfo.frShort;
    return fundingRateInfo.shortFRStored;
  }

  function getTotalLongFR(
    uint256 index,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view override returns (int72) {
    FundingRateInfo memory fundingRateInfo = _getFundingRateInfo(index, historyTimestamp, historySearchHint);
    // return
    //   fundingRateInfo.longFRStored +
    //   int72(uint72(historyTimestamp - fundingRateInfo.lastFRUpdateTime)) *
    //   fundingRateInfo.frLong;
    return fundingRateInfo.longFRStored;
  }

  function getAccountFR(
    address account,
    uint256 index,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view returns (int112) {
    PositionInfo memory positionInfo_ = positionInfo[index][account];
    int256 accumulatedPercentage;
    if (positionInfo_.position < 0) {
      accumulatedPercentage = (getTotalShortFR(index, historyTimestamp, historySearchHint) -
        positionInfo_.positionShortFRStored);
    } else {
      accumulatedPercentage = (getTotalLongFR(index, historyTimestamp, historySearchHint) -
        positionInfo_.positionLongFRStored);
    }
    int112 absPosition = positionInfo_.position < 0 ? -positionInfo_.position : positionInfo_.position;
    return int112(positionInfo_.frAccumulated + (absPosition * accumulatedPercentage) / _FR_PRECISION);
  }

  function getPNL(address account, uint256 index, int112 price) public view returns (int112) {
    PositionInfo memory positionInfo_ = positionInfo[index][account];
    return (positionInfo_.position * (price - int112(uint112(positionInfo_.positionAvgPrice)))) / _INT_PRECISION;
  }

  // named return parameters because of stack to deep
  function calculateMarginLevel(
    address account,
    PriceData[] memory prices,
    bool checkPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view returns (int112 marginLevel, int112 equity, int112 margin, int112[] memory pnls, int112[] memory frs) {
    equity = IDepositDEX(depositDex).getTotalBalance(account, prices);
    margin = 0;
    uint256 len = prices.length;
    pnls = new int112[](len);
    frs = new int112[](len);
    uint256 pricesChecked = 0;
    for (uint256 i = 0; i < len; ++i) {
      uint256 index = prices[i].index;
      if (!_activeInstruments[account].contains(index)) continue;

      {
        PositionInfo memory positionInfo_ = positionInfo[index][account];
        // int112 leverage = int112(uint112(_getInstrumentLeverage(index)));
        int112 leverage = int112(uint112(positionInfo_.leverage));
        int112 absPosition = positionInfo_.position < 0 ? -positionInfo_.position : positionInfo_.position;
        margin += (absPosition * int112(uint112(positionInfo_.positionAvgPrice))) / _INT_PRECISION / leverage;
      }

      pnls[i] = getPNL(account, index, int112(uint112(prices[i].price)));
      frs[i] =
        (getAccountFR(account, index, historyTimestamp, historySearchHint) * int112(uint112(prices[i].price))) /
        _INT_PRECISION;
      equity += pnls[i] + frs[i];
      ++pricesChecked;
    }
    if (checkPrices && _activeInstruments[account].length() != pricesChecked) revert IncorrectInstrumentIndexes();

    return (margin != 0 ? (equity * 100 - 1) / margin : int112(0), equity, margin, pnls, frs);
  }

  function checkMarginWithPrices(
    address account,
    int112 marginLevel,
    uint112[] memory fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view returns (bool, int112) {
    if (fullPrices.length != instrumentsLength) revert PriceArrayLengthError();
    uint256[] memory indices = _activeInstruments[account].values();
    PriceData[] memory prices = new PriceData[](indices.length);
    for (uint256 i = 0; i < indices.length; ++i) {
      uint256 index = indices[i];
      prices[i] = PriceData(index, fullPrices[index]);
    }
    return _checkMargin(account, marginLevel, prices, false, historyTimestamp, historySearchHint);
  }

  function _checkMargin(
    address account,
    int112 marginLevel,
    PriceData[] memory prices,
    bool checkPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal view returns (bool, int112) {
    (int112 accountMarginLevel, int112 equity, int112 margin, , ) = calculateMarginLevel(
      account,
      prices,
      checkPrices,
      historyTimestamp,
      historySearchHint
    );
    return ((margin == 0 || accountMarginLevel >= marginLevel), equity);
  }

  function accountsWithOpenPositionLength() public view returns (uint256) {
    return _accountsWithOpenPositions.length();
  }

  function getAccountsWithOpenPositions(uint256 offset, uint256 limit) public view returns (address[] memory res) {
    uint256 length = _accountsWithOpenPositions.length();
    if (offset >= length) return res;
    uint256 size = length - offset < limit ? length - offset : limit;
    res = new address[](size);
    for (uint256 i = offset; i < offset + size; ++i) {
      res[i] = _accountsWithOpenPositions.at(i);
    }
  }

  function getOpenPositions(uint256 offset, uint256 limit) public view returns (AccountPositions[] memory positions) {
    uint256 length = _accountsWithOpenPositions.length();
    if (offset >= length) return (positions);
    uint256 size = length - offset < limit ? length - offset : limit;
    positions = new AccountPositions[](size);
    for (uint256 i = offset; i < offset + size; ++i) {
      positions[i].account = _accountsWithOpenPositions.at(i);
      uint256[] memory indexes = getActiveInstrumentsIndexes(positions[i].account);
      uint256 len = indexes.length;
      positions[i].positions = new PositionInfo[](len);
      for (uint256 j = 0; j < len; ++j) {
        positions[i].positions[j] = positionInfo[indexes[j]][positions[i].account];
      }
    }
  }

  function _calculateLiquidationFee(PositionInfo memory position) internal view returns (uint112) {
    uint112 absPosition = position.position < 0 ? uint112(-position.position) : uint112(position.position);
    // TODO make fixed with constant precision
    // uint112 margin = (absPosition * position.positionAvgPrice) / _UINT_PRECISION / _getInstrumentLeverage(index);
    uint112 margin = (absPosition * position.positionAvgPrice) / _UINT_PRECISION / position.leverage;
    uint112 liquidationFee = (margin * uint112(liquidationFeePercent)) / _UINT_PRECISION;

    return liquidationFee;
  }

  //////////////////////////
  //  Mutative functions
  //////////////////////////
  function liquidatePositions(
    MultiOrderLiquidation memory liquidationOrder,
    uint112[] memory fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external onlyRole(MATCHER_ROLE) {
    OrderValidationLib.checkLiquidationOrder(liquidationOrder);

    //TODO double calculation of pnl in checkMargin and then liquidationPosition
    (bool validMargin, ) = _checkMargin(
      liquidationOrder.accountToLiquidate,
      soLevel,
      liquidationOrder.prices,
      true,
      historyTimestamp,
      historySearchHint
    );
    if (validMargin) revert SufficientMargin();

    uint256 liquidationPricesLength = liquidationOrder.liquidationPrices.length;
    for (uint256 i = 0; i < liquidationPricesLength; ++i) {
      uint112 liquidationPrice = uint112(liquidationOrder.liquidationPrices[i].price);
      uint256 index = liquidationOrder.liquidationPrices[i].index;
      _liquidatePosition(
        index,
        liquidationOrder.accountToLiquidate,
        liquidationOrder.liquidator,
        liquidationOrder.collateral,
        int112(liquidationPrice),
        fullPrices,
        historyTimestamp,
        historySearchHint
      );
    }
  }

  function _liquidatePosition(
    uint256 index,
    address accountToLiquidate,
    address liquidator,
    address collateral,
    int112 liquidationPrice,
    uint112[] memory fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal returns (int112 pnl, int112 fr, uint112 liquidationFee) {
    PositionInfo storage accountToLiquidatePosition = positionInfo[index][accountToLiquidate];
    PositionInfo storage liquidatorPosition = positionInfo[index][liquidator];
    if (accountToLiquidatePosition.position == 0) revert ZeroPositionLiquidation();
    int112 positionAvgPrice = int112(uint112(accountToLiquidatePosition.positionAvgPrice));
    pnl = (accountToLiquidatePosition.position * (liquidationPrice - positionAvgPrice)) / _INT_PRECISION;
    fr =
      (getAccountFR(accountToLiquidate, index, historyTimestamp, historySearchHint) * liquidationPrice) /
      _INT_PRECISION;

    int112 balance = _getBalance(accountToLiquidate, collateral, fullPrices[index]);
    balance += pnl + fr;
    liquidationFee = _calculateLiquidationFee(accountToLiquidatePosition);

    balance -= int112(liquidationFee);
    int112 balanceOfLiquidator = _getBalance(liquidator, collateral, fullPrices[index]);

    // If it's the last instrument that user have liquidator pays for user's negative balance
    if (_activeInstruments[accountToLiquidate].length() == 1 && balance < 0) {
      _setBalance(accountToLiquidate, collateral, 0);
      _setBalance(liquidator, collateral, balance + int112(liquidationFee));
    } else {
      _setBalance(accountToLiquidate, collateral, balance);
      _setBalance(liquidator, collateral, balanceOfLiquidator + int112(liquidationFee));
    }

    _changePosition(
      index,
      liquidator,
      liquidatorPosition,
      collateral,
      accountToLiquidatePosition.position,
      liquidationPrice,
      int112(100),
      liquidatorPosition.leverage,
      fullPrices,
      historyTimestamp,
      historySearchHint
    );

    accountToLiquidatePosition.position = 0;
    accountToLiquidatePosition.frAccumulated = 0;
    _updateActivePositions(accountToLiquidate, index, 0);

    emit PositionLiquidated(
      accountToLiquidate,
      index,
      uint112(liquidationFee),
      _getBalance(accountToLiquidate, collateral, fullPrices[index]),
      pnl,
      fr
    );
  }

  function liquidatePosition(
    OrderLiquidation memory liquidationOrder,
    uint112[] memory fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external onlyRole(MATCHER_ROLE) {
    OrderValidationLib.checkLiquidationOrder(liquidationOrder);
    if (liquidationOrder.prices[0].index != liquidationOrder.index) revert PriceOfLiquidatedInstrumentNotFirst();

    (bool validMargin, ) = _checkMargin(
      liquidationOrder.accountToLiquidate,
      soLevel,
      liquidationOrder.prices,
      true,
      historyTimestamp,
      historySearchHint
    );
    if (validMargin) revert SufficientMargin();

    _liquidatePosition(
      liquidationOrder.index,
      liquidationOrder.accountToLiquidate,
      liquidationOrder.liquidator,
      liquidationOrder.collateral,
      int112(uint112(liquidationOrder.prices[0].price)),
      fullPrices,
      historyTimestamp,
      historySearchHint
    );
  }

  function _validateUserOrder(Order memory order) internal returns (address) {
    return ISessionManager(sessionManager).validateUserOrder(order);
  }

  function fillOrders(
    Order memory buyOrder,
    Order memory sellOrder,
    uint80 filledPrice,
    uint96 filledAmount,
    uint112[] memory fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public onlyRole(MATCHER_ROLE) {
    // Orders validation
    {
      address buyOrderSigner = buyOrder.senderAddress;
      address sellOrderSigner = sellOrder.senderAddress;
      if (buyOrder.userSession != address(0)) {
        buyOrderSigner = _validateUserOrder(buyOrder);
        if (buyOrderSigner == address(0)) revert InvalidSession();
      }
      if (sellOrder.userSession != address(0)) {
        sellOrderSigner = _validateUserOrder(sellOrder);
        if (sellOrderSigner == address(0)) revert InvalidSession();
      }
      (bytes32 buyOrderDigest, bytes32 sellOrderDigest) = OrderValidationLib.checkOrdersInfo(
        buyOrder,
        sellOrder,
        buyOrderSigner,
        sellOrderSigner,
        msg.sender,
        uint256(filledAmount),
        uint256(filledPrice),
        msg.sender,
        instrumentsLength
      );

      _fillOrder(buyOrderDigest, buyOrder.amount, filledAmount);
      _fillOrder(sellOrderDigest, sellOrder.amount, filledAmount);
    }
    // Paying execution fee to matcher
    {
      buyOrder.matcherFee = uint64((uint256(buyOrder.matcherFee) * filledAmount) / buyOrder.amount);
      sellOrder.matcherFee = uint64((uint256(sellOrder.matcherFee) * filledAmount) / sellOrder.amount);
      int112 buyOrderMatcherFee = int112(uint112(buyOrder.matcherFee));
      int112 sellOrderMatcherFee = int112(uint112(sellOrder.matcherFee));
      _setBalance(
        buyOrder.senderAddress,
        buyOrder.collateral,
        _getBalance(buyOrder.senderAddress, buyOrder.collateral, fullPrices[buyOrder.instrumentIndex]) -
          buyOrderMatcherFee
      );
      _setBalance(
        sellOrder.senderAddress,
        sellOrder.collateral,
        _getBalance(sellOrder.senderAddress, sellOrder.collateral, fullPrices[sellOrder.instrumentIndex]) -
          sellOrderMatcherFee
      );
      _setBalance(
        buyOrder.matcherAddress,
        buyOrder.collateral,
        _getBalance(buyOrder.matcherAddress, buyOrder.collateral, fullPrices[buyOrder.instrumentIndex]) +
          buyOrderMatcherFee
      );
      _setBalance(
        sellOrder.matcherAddress,
        sellOrder.collateral,
        _getBalance(sellOrder.matcherAddress, sellOrder.collateral, fullPrices[sellOrder.instrumentIndex]) +
          sellOrderMatcherFee
      );
    }

    uint256 index = buyOrder.instrumentIndex;
    PositionInfo storage buyerUserData = positionInfo[index][buyOrder.senderAddress];
    PositionInfo storage sellerUserData = positionInfo[index][sellOrder.senderAddress];
    int112 amount = int112(uint112(filledAmount));
    int112 soLevel_ = soLevel;

    _changePosition(
      index,
      buyOrder.senderAddress,
      buyerUserData,
      buyOrder.collateral,
      amount,
      int112(uint112(filledPrice)),
      soLevel_,
      buyOrder.leverage,
      fullPrices,
      historyTimestamp,
      historySearchHint
    );
    _changePosition(
      index,
      sellOrder.senderAddress,
      sellerUserData,
      sellOrder.collateral,
      -amount,
      int112(uint112(filledPrice)),
      soLevel_,
      sellOrder.leverage,
      fullPrices,
      historyTimestamp,
      historySearchHint
    );

    emit NewTrade(buyOrder.instrumentIndex, buyOrder.senderAddress, sellOrder.senderAddress, filledPrice, filledAmount);
  }

  function _fillOrder(bytes32 orderDigest, uint256 orderAmount, uint96 filledAmount) internal {
    uint96 newFilledAmount = filledAmounts[orderDigest] + filledAmount;
    if (newFilledAmount > orderAmount) revert OrderIsAlreadyFilled();
    filledAmounts[orderDigest] = newFilledAmount;
  }

  function _changePosition(
    uint256 index,
    address positionOwner,
    PositionInfo storage posData,
    address collateral,
    int112 amount,
    int112 price,
    int112 marginLevel,
    uint16 leverage,
    uint112[] memory fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal {
    int112 newPosition = amount + posData.position;

    bool changePositionSide = (posData.position > 0 && newPosition <= 0) || (posData.position < 0 && newPosition >= 0);
    bool increase_position = (newPosition > 0 && amount > 0) || (newPosition < 0 && amount < 0);
    int112 realizedFRCollateral;
    int112 realizedPNL;
    if (changePositionSide) {
      realizedFRCollateral =
        (getAccountFR(positionOwner, index, historyTimestamp, historySearchHint) *
          int112(uint112(posData.positionAvgPrice))) /
        _INT_PRECISION;
      realizedPNL = getPNL(positionOwner, index, price);
      _setBalance(
        positionOwner,
        collateral,
        _getBalance(positionOwner, collateral, fullPrices[index]) + realizedFRCollateral + realizedPNL
      );
      _setBalance(
        fundingRateAccount,
        collateral,
        _getBalance(fundingRateAccount, collateral, fullPrices[index]) - realizedFRCollateral
      );
      posData.frAccumulated = 0;
      posData.positionAvgPrice = uint80(uint112(price));
    } else if (increase_position) {
      posData.positionAvgPrice = uint80(
        uint112((amount * price + posData.position * int112(uint112(posData.positionAvgPrice))) / newPosition)
      );
      posData.frAccumulated = getAccountFR(positionOwner, index, historyTimestamp, historySearchHint);
    } else {
      //  Partially close.
      int112 frCurrent = getAccountFR(positionOwner, index, historyTimestamp, historySearchHint);

      //  In this case, amount and posData.position would have different signs
      realizedFRCollateral =
        (frCurrent * int112(uint112(posData.positionAvgPrice)) * -1 * amount) /
        posData.position /
        _INT_PRECISION;
      realizedPNL = (getPNL(positionOwner, index, price) * amount * -1) / posData.position;

      _setBalance(
        positionOwner,
        collateral,
        _getBalance(positionOwner, collateral, fullPrices[index]) + realizedFRCollateral + realizedPNL
      );
      _setBalance(
        fundingRateAccount,
        collateral,
        _getBalance(fundingRateAccount, collateral, fullPrices[index]) - realizedFRCollateral
      );
      posData.frAccumulated = (frCurrent * newPosition) / posData.position;
    }

    posData.position = newPosition;
    posData.leverage = leverage;
    posData.positionLongFRStored = getTotalLongFR(index, historyTimestamp, historySearchHint);
    posData.positionShortFRStored = getTotalShortFR(index, historyTimestamp, historySearchHint);
    posData.positionLastUpdate = uint32(historyTimestamp);

    _updateActivePositions(positionOwner, index, posData.position);
    {
      (bool validMargin, ) = checkMarginWithPrices(
        positionOwner,
        marginLevel,
        fullPrices,
        historyTimestamp,
        historySearchHint
      );
      if (!validMargin) revert InsufficientMargin();
    }

    emit PositionUpdate(
      index,
      positionOwner,
      _getBalance(positionOwner, collateral, fullPrices[index]),
      posData,
      realizedPNL,
      realizedFRCollateral
    );
  }

  function _updateActivePositions(address account, uint256 index, int256 position) internal {
    if (position != 0) {
      if (_activeInstruments[account].length() >= maxOpenPositions) revert MaxOpenPositionsExceeded();
      _activeInstruments[account].add(index);
      _accountsWithOpenPositions.add(account);
    } else {
      _activeInstruments[account].remove(index);
      if (_activeInstruments[account].length() == 0) {
        _accountsWithOpenPositions.remove(account);
      }
    }
    settledOrders[account]++;
  }

  function _getBalance(address account_, address collateral_, uint256 price_) internal view returns (int112 balance) {
    balance = IDepositDEX(depositDex).getBalance(account_, collateral_, price_);
  }

  function _setBalance(address account_, address collateral_, int112 balance_) internal {
    IDepositDEX(depositDex).setBalance(account_, collateral_, balance_);
  }
}
