// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {SignedMath} from "@openzeppelin/contracts/utils/math/SignedMath.sol";
import {BaseDEX, FundingRateInfo, BasicParams} from "./base/BaseDEX.sol";
import "./interfaces/IEVEDEX.sol";

contract EVEDEX is BaseDEX, IEVEDEX {
  using EnumerableSet for EnumerableSet.UintSet;
  using EnumerableSet for EnumerableSet.AddressSet;

  constructor() {}

  function initialize(address initialOwner_, BasicParams calldata params_) external initializer {
    __BaseDEX_init(initialOwner_, params_);
  }

  function getTotalFR(
    uint256 index,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view returns (int72, int72) {
    FundingRateInfo memory frInfo = _getFundingRateInfo(index, historyTimestamp, historySearchHint);
    return (frInfo.longFRStored, frInfo.shortFRStored);
  }

  function getAccountFR(
    address account,
    uint256 index,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view returns (int256, int256) {
    PositionInfo memory positionInfo_ = _positionInfo[index][account];
    FundingRateInfo memory frInfo = _getFundingRateInfo(index, historyTimestamp, historySearchHint);
    int256 accumulatedPercentage;
    int256 staticFee;
    if (positionInfo_.position < 0) {
      accumulatedPercentage = (frInfo.shortFRStored - positionInfo_.positionShortFRStored);
    } else {
      accumulatedPercentage = (frInfo.longFRStored - positionInfo_.positionLongFRStored);
    }
    int256 frDiff = (_absPosition(positionInfo_.position) * accumulatedPercentage) / _FR_PRECISION;
    if (accumulatedPercentage > 0) {
      staticFee = (frDiff * frInfo.staticFr) / _FR_PRECISION;
    }
    return (positionInfo_.frAccumulated - staticFee + frDiff, staticFee);
  }

  function getPNL(address account, uint256 index, int256 price) public view returns (int256) {
    PositionInfo memory positionInfo_ = _positionInfo[index][account];
    return ((price - positionInfo_.positionAvgPrice) * positionInfo_.position) / _INT_PRECISION;
  }

  function calculateMarginLevel(
    address account,
    PriceData[] memory prices,
    CollateralPriceData[] memory collateralPrices,
    bool checkPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  )
    public
    view
    returns (
      int256 marginLevel,
      int256 equity,
      int256 totalMargin,
      int256[] memory margins,
      int256[] memory pnls,
      int256[] memory frs
    )
  {
    equity = _depositDex.getTotalBalance(account, collateralPrices);
    uint256 len = prices.length;
    pnls = new int256[](len);
    frs = new int256[](len);
    margins = new int256[](len);
    uint256 pricesChecked = 0;
    for (uint256 i; i < len; i++) {
      uint256 index = prices[i].index;
      if (!_activeInstruments[account].contains(index)) continue;

      {
        PositionInfo memory positionInfo_ = _positionInfo[index][account];
        int256 margin = int256(
          _getMarginFromCalc(index, positionInfo_.position, positionInfo_.positionAvgPrice, positionInfo_.leverage)
        );
        margins[i] = margin;
        totalMargin += margin;
      }

      pnls[i] = getPNL(account, index, int256(prices[i].price));
      (int256 frsSingle, ) = getAccountFR(account, index, historyTimestamp, historySearchHint);
      frs[i] = (frsSingle * int256(prices[i].price)) / _INT_PRECISION;
      equity += pnls[i] + frs[i];
      ++pricesChecked;
    }
    if (checkPrices && _activeInstruments[account].length() != pricesChecked) revert IncorrectInstrumentIndexes();

    marginLevel = totalMargin != 0 ? (equity * _MARGIN_LEVEL_PRECISION - 1) / totalMargin : int256(0);
  }

  function checkMarginWithPrices(
    address account,
    int256 marginLevel,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view returns (bool) {
    if (fullPrices.instrumentPrices.length != _instrumentsLength) revert PriceArrayLengthError();
    uint256[] memory indices = _activeInstruments[account].values();
    uint256 len = indices.length;
    PriceData[] memory prices = new PriceData[](len);
    for (uint256 i; i < len; ++i) {
      prices[i] = fullPrices.instrumentPrices[indices[i]];
    }
    (bool valid /*equity, margin, margins*/, , , ) = _checkMargin(
      account,
      marginLevel,
      prices,
      fullPrices.collateralPrices,
      false,
      historyTimestamp,
      historySearchHint
    );
    return valid;
  }

  function _checkMargin(
    address account,
    int256 marginLevel,
    PriceData[] memory prices,
    CollateralPriceData[] memory collateralPrices,
    bool checkPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal view returns (bool, int256, int256, int256[] memory) {
    (
      int256 accountMarginLevel,
      int256 equity,
      int256 margin,
      int256[] memory margins /*, pnls, frs */,
      ,

    ) = calculateMarginLevel(account, prices, collateralPrices, checkPrices, historyTimestamp, historySearchHint);
    return ((margin == 0 || accountMarginLevel >= marginLevel), equity, margin, margins);
  }

  function _calculateLiquidationFee(
    uint256 index,
    int112 position,
    int80 avgPrice,
    uint16 leverage
  ) internal view returns (int256) {
    return (_getMarginFromCalc(index, position, avgPrice, leverage) * _liquidationFeePercent) / _INT_PRECISION;
  }

  function _getMarginFromCalc(
    uint256 index,
    int112 position,
    int80 avgPrice,
    uint16 leverage
  ) internal view returns (int256) {
    leverage = leverage == 0 ? 1 : leverage;
    uint256 positionVolume = (SignedMath.abs(position) * uint80(avgPrice)) / _UINT_PRECISION / leverage;

    return _marginCalculator.getMargin(index, positionVolume);
  }

  function _absPosition(int256 position) internal pure returns (int256) {
    return int256(SignedMath.abs(position));
  }

  //////////////////////////
  //  Mutative functions
  //////////////////////////

  function liquidatePositions(
    MultiOrderLiquidation memory liquidationOrder,
    FullPrices calldata fullPrices,
    LiquidationCollaterals calldata collateralIndices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external onlyRole(_MATCHER_ROLE) {
    OrderValidationLib.checkLiquidationOrder(liquidationOrder, historyTimestamp);

    //TODO double calculation of pnl in checkMargin and then liquidationPosition
    (bool validMargin, , , ) = _checkMargin(
      liquidationOrder.accountToLiquidate,
      _soLevel,
      liquidationOrder.prices,
      fullPrices.collateralPrices,
      true,
      historyTimestamp,
      historySearchHint
    );
    if (validMargin) revert SufficientMargin();

    uint256 liquidationPricesLength = liquidationOrder.liquidationPrices.length;
    for (uint256 i = 0; i < liquidationPricesLength; ++i) {
      uint256 liquidationPrice = liquidationOrder.liquidationPrices[i].price;
      uint256 index = liquidationOrder.liquidationPrices[i].index;
      _liquidatePosition(
        index,
        liquidationOrder.accountToLiquidate,
        liquidationOrder.liquidator,
        int256(liquidationPrice),
        fullPrices,
        collateralIndices,
        liquidationOrder.leverage,
        historyTimestamp,
        historySearchHint
      );
    }
  }

  function _liquidatePosition(
    uint256 index,
    address accountToLiquidate,
    address liquidator,
    int256 liquidationPrice,
    FullPrices calldata fullPrices,
    LiquidationCollaterals calldata collateralIndices,
    uint16 liquidatorLeverage,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal returns (int256 pnl, int256 fr, int256 liquidationFee) {
    PositionInfo storage accountToLiquidatePosition = _positionInfo[index][accountToLiquidate];
    PositionInfo storage liquidatorPosition = _positionInfo[index][liquidator];
    if (accountToLiquidatePosition.position == 0) revert ZeroPositionLiquidation();
    int256 positionAvgPrice = accountToLiquidatePosition.positionAvgPrice;
    pnl = (accountToLiquidatePosition.position * (liquidationPrice - positionAvgPrice)) / _INT_PRECISION;
    (fr, ) = getAccountFR(accountToLiquidate, index, historyTimestamp, historySearchHint);
    fr = (fr * liquidationPrice) / _INT_PRECISION;
    liquidationFee = _calculateLiquidationFee(
      index,
      accountToLiquidatePosition.position,
      accountToLiquidatePosition.positionAvgPrice,
      accountToLiquidatePosition.leverage
    );

    _adjustBalances(accountToLiquidate, liquidator, fullPrices, collateralIndices, pnl + fr, int256(liquidationFee));

    _changePosition(
      index,
      liquidator,
      liquidatorPosition,
      collateralIndices.liquidatorIndex,
      accountToLiquidatePosition.position,
      liquidationPrice,
      _soLevel,
      liquidatorLeverage,
      true,
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
      liquidationFee,
      _depositDex.getTotalBalance(accountToLiquidate, fullPrices.collateralPrices),
      pnl,
      fr
    );
  }

  function _adjustBalances(
    address accountToLiquidate,
    address liquidator,
    FullPrices calldata fullPrices,
    LiquidationCollaterals calldata collateralIndices,
    int256 sumPnlFr,
    int256 liquidationFee
  ) internal {
    uint256 len = collateralIndices.indicesToLiquidate.length;
    address collateral;
    int256 collateralPrice;
    int256 balance;
    int256 balanceOfLiquidator;
    for (uint256 i; i < len && sumPnlFr < 0; i++) {
      uint256 index = collateralIndices.indicesToLiquidate[i];
      collateral = fullPrices.collateralPrices[index].collateral;
      collateralPrice = int256(fullPrices.collateralPrices[index].price);
      balance = _getBalance(accountToLiquidate, collateral);
      balanceOfLiquidator = _getBalance(liquidator, collateral);

      int256 newBalance = balance + ((sumPnlFr - liquidationFee) * _COLLATERAL_PRECISION) / collateralPrice;
      if (newBalance > 0) {
        _setBalance(accountToLiquidate, collateral, newBalance);
        _setBalance(
          liquidator,
          collateral,
          balanceOfLiquidator + (liquidationFee * _COLLATERAL_PRECISION) / collateralPrice
        );
        sumPnlFr = 0;
      } else {
        _setBalance(accountToLiquidate, collateral, 0);
        sumPnlFr = sumPnlFr + (balance * collateralPrice) / _COLLATERAL_PRECISION;
      }
    }

    if (sumPnlFr < 0) {
      _setBalance(
        liquidator,
        collateral,
        balanceOfLiquidator + balance + (sumPnlFr * _COLLATERAL_PRECISION) / collateralPrice
      );
    }
  }

  /**
   * @notice Executes an ADL (Auto-Deleveraging) liquidation for a specific account.
   */
  function adlLiquidation(
    AdlOrderLiquidation memory liquidationOrder,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external onlyRole(_MATCHER_ROLE) {
    uint256 index = liquidationOrder.index;
    if (liquidationOrder.prices[0].index != index) revert PriceOfLiquidatedInstrumentNotFirst();

    int256 soLevel_ = _soLevel;
    (bool validMargin, , , ) = _checkMargin(
      liquidationOrder.accountToLiquidate,
      soLevel_,
      liquidationOrder.prices,
      fullPrices.collateralPrices,
      true,
      historyTimestamp,
      historySearchHint
    );
    if (validMargin) revert SufficientMargin();
    PositionInfo storage positionInfoLiquidator = _positionInfo[index][liquidationOrder.liquidator];
    PositionInfo storage positionInfoToLiquidate = _positionInfo[index][liquidationOrder.accountToLiquidate];
    uint256 liquidatorPositionAvgPrice = uint80(positionInfoLiquidator.positionAvgPrice);
    uint256 liquidationPrice = liquidationOrder.prices[0].price;
    if (
      positionInfoLiquidator.position > 0
        ? liquidationPrice < liquidatorPositionAvgPrice
        : liquidationPrice > liquidatorPositionAvgPrice
    ) revert UnprofitableTrade();

    _changePosition(
      index,
      liquidationOrder.liquidator,
      positionInfoLiquidator,
      liquidationOrder.collateralIndexLiquidator,
      liquidationOrder.amount,
      int256(liquidationPrice),
      soLevel_,
      liquidationOrder.leverageLiquidator,
      true,
      fullPrices,
      historyTimestamp,
      historySearchHint
    );
    _changePosition(
      index,
      liquidationOrder.accountToLiquidate,
      positionInfoToLiquidate,
      liquidationOrder.collateralIndexToLiquidate,
      -liquidationOrder.amount,
      int256(liquidationPrice),
      type(int256).min,
      liquidationOrder.leverageToLiquidate,
      true,
      fullPrices,
      historyTimestamp,
      historySearchHint
    );
  }

  function fillOrder(
    OrderExtended calldata filledOrder,
    OrderExtended calldata complimentaryOrder,
    uint256 filledPrice,
    uint256 filledAmount,
    int256 matcherFee,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external onlyRole(_MATCHER_ROLE) {
    // _checkLiquidationStatus(filledOrder.order.senderAddress, LiquidationStatus.Normal);
    // _checkLiquidationStatus(complimentaryOrder.order.senderAddress, LiquidationStatus.Normal);
    // Orders validation
    {
      address filledOrderSigner = _checkUserSession(filledOrder.order);
      address complimentaryOrderSigner = _checkUserSession(complimentaryOrder.order);
      (bytes32 filledOrderDigest, bytes32 complimentaryOrderDigest, bytes32 settlementDigest) = OrderValidationLib
        .checkOrderInfo(
          filledOrder.order,
          complimentaryOrder.order,
          filledOrderSigner,
          complimentaryOrderSigner,
          msg.sender,
          filledAmount,
          filledPrice,
          _instrumentsLength,
          historyTimestamp
        );

      _fillOrder(filledOrderDigest, filledOrder.order.amount, filledAmount, filledOrder.order.limited);
      _fillSettlement(
        filledOrderDigest,
        complimentaryOrderDigest,
        settlementDigest,
        filledOrder.order.orderId,
        complimentaryOrder.order.orderId
      );
    }

    _payMatcherFee(
      filledOrder.order.senderAddress,
      filledOrder.order.matcherAddress,
      fullPrices.collateralPrices[filledOrder.collateralIndex].collateral,
      _maxMatcherFee,
      matcherFee,
      filledAmount,
      fullPrices.collateralPrices[filledOrder.collateralIndex].price
    );

    uint256 index = filledOrder.order.instrumentIndex;
    PositionInfo storage userData = _positionInfo[index][filledOrder.order.senderAddress];
    int256 amount = filledOrder.order.side == 0 ? -int256(filledAmount) : int256(filledAmount);

    _changePosition(
      index,
      filledOrder.order.senderAddress,
      userData,
      filledOrder.collateralIndex,
      amount,
      int256(filledPrice),
      _soLevel,
      filledOrder.order.leverage,
      filledOrder.order.limited,
      fullPrices,
      historyTimestamp,
      historySearchHint
    );

    emit NewTrade(
      index,
      filledOrder.order.senderAddress,
      complimentaryOrder.order.senderAddress,
      filledPrice,
      filledAmount
    );
  }

  function _payMatcherFee(
    address account,
    address matcher,
    address collateral,
    uint256 matcherFeeLimit,
    int256 matcherFee,
    uint256 amount,
    uint256 price
  ) internal {
    if (SignedMath.abs(matcherFee) > matcherFeeLimit) revert MatcherFeeLimitExceeded();

    int256 fee = (matcherFee * int256(amount) * _INT_COLLATERAL_PRECISION) / int256(price) / _INT_PRECISION;
    _setBalance(account, collateral, _getBalance(account, collateral) - fee);
    _setBalance(matcher, collateral, _getBalance(matcher, collateral) + fee);
  }

  function _checkUserSession(Order calldata order) internal returns (address signer) {
    if (order.userSession == address(0)) return order.senderAddress;
    signer = _validateUserOrder(order);
    if (signer == address(0)) revert InvalidSession();
  }

  function _fillOrder(bytes32 orderDigest, uint256 orderAmount, uint256 filledAmount, bool isLimited) internal {
    if (!isLimited) return;

    uint256 newFilledAmount = _filledAmounts[orderDigest] + filledAmount;
    if (newFilledAmount > orderAmount) revert OrderIsAlreadyFilled();

    _filledAmounts[orderDigest] = newFilledAmount;
  }

  function _fillSettlement(
    bytes32 orderDigest,
    bytes32 complimentaryDigest,
    bytes32 settlementId,
    uint256 orderId,
    uint256 complimentaryId
  ) internal {
    bytes32 storedComplimentaryDigest = _filledSettlements[settlementId];
    bool closed;
    if (storedComplimentaryDigest == bytes32(0)) {
      _filledSettlements[settlementId] = orderDigest;
      _totalOpenedOrders++;
    } else {
      if (storedComplimentaryDigest != complimentaryDigest) revert SettlementMismatch();
      _totalSettledOrders++;
      closed = true;
    }
    emit OrderSettled(settlementId, orderId, complimentaryId, closed);
  }

  function collectFr(
    address account,
    FullPrices calldata fullPrices,
    uint256 collateralIndex,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external onlyRole(_MATCHER_ROLE) {
    uint256[] memory indices = _activeInstruments[account].values();
    uint256 len = indices.length;
    for (uint256 i; i < len; i++) {
      _collectFr(indices[i], account, fullPrices, collateralIndex, historyTimestamp, historySearchHint);
    }
  }

  function _collectFr(
    uint256 index,
    address account,
    FullPrices calldata fullPrices,
    uint256 collateralIndex,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal {
    PositionInfo storage positionInfo = _positionInfo[index][account];
    (int256 frCurrent, int256 staticFee) = getAccountFR(account, index, historyTimestamp, historySearchHint);
    if (frCurrent == 0) return;
    address collateral = fullPrices.collateralPrices[collateralIndex].collateral;
    int256 collateralPrice = int256(fullPrices.collateralPrices[collateralIndex].price);
    int256 posAvgPrice = positionInfo.positionAvgPrice;
    int256 collateralFee = (frCurrent * posAvgPrice * _COLLATERAL_PRECISION) / collateralPrice / _INT_PRECISION;
    int256 staticCollateralFee;
    if (staticFee != 0) {
      address staticFrAccount = _staticFundingRateAccount;
      staticCollateralFee = (staticFee * posAvgPrice * _COLLATERAL_PRECISION) / collateralPrice / _INT_PRECISION;
      _setBalance(staticFrAccount, collateral, _getBalance(staticFrAccount, collateral) + staticCollateralFee);
    }
    address frAccount = _fundingRateAccount;
    _setBalance(frAccount, collateral, _getBalance(frAccount, collateral) - collateralFee - staticCollateralFee);
    int256 newBalance = _getBalance(account, collateral) + collateralFee;
    _setBalance(account, collateral, newBalance);
    positionInfo.frAccumulated = 0;
    (positionInfo.positionLongFRStored, positionInfo.positionShortFRStored) = getTotalFR(
      index,
      historyTimestamp,
      historySearchHint
    );
    positionInfo.positionLastUpdate = uint32(historyTimestamp);
    emit FrCollected(index, account, collateral, newBalance, staticCollateralFee);
  }

  function _changePosition(
    uint256 index,
    address positionOwner,
    PositionInfo storage posData,
    uint256 collateralIndex,
    int256 amount,
    int256 price,
    int256 marginLevel,
    uint16 leverage,
    bool isLimited,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal {
    int256 oldPosition = posData.position;
    int256 newPosition = amount + oldPosition;
    if (!isLimited) {
      _checkTPSLLimit(oldPosition, newPosition);
    }

    int256 realizedFRCollateral;
    int256 realizedPNL;
    address collateral = fullPrices.collateralPrices[collateralIndex].collateral;
    int256 collateralPrice = int256(fullPrices.collateralPrices[collateralIndex].price);
    if ((oldPosition > 0 && newPosition <= 0) || (oldPosition < 0 && newPosition >= 0)) {
      (realizedFRCollateral, realizedPNL) = _changePositionSide(
        index,
        positionOwner,
        posData,
        price,
        collateral,
        collateralPrice,
        historyTimestamp,
        historySearchHint
      );
    } else if ((newPosition > 0 && amount > 0) || (newPosition < 0 && amount < 0)) {
      _increasePosition(
        index,
        positionOwner,
        posData,
        amount,
        price,
        newPosition,
        oldPosition,
        historyTimestamp,
        historySearchHint
      );
    } else {
      (realizedFRCollateral, realizedPNL) = _partiallyClosePosition(
        index,
        positionOwner,
        posData,
        amount,
        price,
        newPosition,
        oldPosition,
        collateral,
        collateralPrice,
        historyTimestamp,
        historySearchHint
      );
    }

    posData.position = int112(newPosition);
    posData.leverage = leverage;
    (posData.positionLongFRStored, posData.positionShortFRStored) = getTotalFR(
      index,
      historyTimestamp,
      historySearchHint
    );
    posData.positionLastUpdate = uint32(historyTimestamp);

    _updateActivePositions(positionOwner, index, posData.position);
    bool validMargin = checkMarginWithPrices(
      positionOwner,
      marginLevel,
      fullPrices,
      historyTimestamp,
      historySearchHint
    );
    if (!validMargin) revert InsufficientMargin();

    emit PositionUpdate(
      index,
      positionOwner,
      _getBalance(positionOwner, collateral),
      posData,
      realizedPNL,
      realizedFRCollateral
    );
  }

  function _checkTPSLLimit(int256 oldPos, int256 newPos) internal view {
    if (oldPos * newPos >= 0) {
      if (oldPos * (oldPos - newPos) < 0) revert IncreasingPositionWithTPSL();

      return;
    }

    if ((-newPos * _INT_PRECISION) / oldPos > _allowedOverloadTPSL) revert RevertingPositionWithTPSL();
  }

  function _changePositionSide(
    uint256 index,
    address positionOwner,
    PositionInfo storage posData,
    int256 price,
    address collateral,
    int256 collateralPrice,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal returns (int256 realizedFRCollateral, int256 realizedPNL) {
    (realizedFRCollateral, ) = getAccountFR(positionOwner, index, historyTimestamp, historySearchHint);
    realizedFRCollateral = (realizedFRCollateral * posData.positionAvgPrice) / _INT_PRECISION;
    realizedPNL = getPNL(positionOwner, index, price);
    _setBalance(
      positionOwner,
      collateral,
      _getBalance(positionOwner, collateral) +
        ((realizedFRCollateral + realizedPNL) * _COLLATERAL_PRECISION) /
        collateralPrice
    );
    address frAccount = _fundingRateAccount;
    _setBalance(
      frAccount,
      collateral,
      _getBalance(frAccount, collateral) - (realizedFRCollateral * _COLLATERAL_PRECISION) / collateralPrice
    );
    posData.frAccumulated = 0;
    posData.positionAvgPrice = int80(price);
  }

  function _increasePosition(
    uint256 index,
    address positionOwner,
    PositionInfo storage posData,
    int256 amount,
    int256 price,
    int256 newPosition,
    int256 oldPosition,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal {
    posData.positionAvgPrice = int80((amount * price + oldPosition * posData.positionAvgPrice) / newPosition);
    (int256 frAccumulated, ) = getAccountFR(positionOwner, index, historyTimestamp, historySearchHint);
    posData.frAccumulated = int112(frAccumulated);
  }

  function _partiallyClosePosition(
    uint256 index,
    address positionOwner,
    PositionInfo storage posData,
    int256 amount,
    int256 price,
    int256 newPosition,
    int256 oldPosition,
    address collateral,
    int256 collateralPrice,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal returns (int256 realizedFRCollateral, int256 realizedPNL) {
    (int256 frCurrent, ) = getAccountFR(positionOwner, index, historyTimestamp, historySearchHint);

    //  In this case, amount and oldPosition would have different signs
    realizedFRCollateral = (frCurrent * posData.positionAvgPrice * -1 * amount) / oldPosition / _INT_PRECISION;
    realizedPNL = (getPNL(positionOwner, index, price) * amount * -1) / oldPosition;

    _setBalance(
      positionOwner,
      collateral,
      _getBalance(positionOwner, collateral) +
        ((realizedFRCollateral + realizedPNL) * _COLLATERAL_PRECISION) /
        collateralPrice
    );
    address frAccount = _fundingRateAccount;
    _setBalance(
      frAccount,
      collateral,
      _getBalance(frAccount, collateral) - (realizedFRCollateral * _COLLATERAL_PRECISION) / collateralPrice
    );
    posData.frAccumulated = int112((frCurrent * newPosition) / oldPosition);
  }

  function _validateUserOrder(Order calldata order) internal returns (address) {
    return _sessionManager.validateUserOrder(order);
  }

  function _updateActivePositions(address account, uint256 index, int256 position) internal {
    if (position == 0) {
      _activeInstruments[account].remove(index);
      if (_activeInstruments[account].length() == 0) {
        _accountsWithOpenPositions.remove(account);
      }
    } else {
      if (_activeInstruments[account].length() >= _maxOpenPositions) revert MaxOpenPositionsExceeded();
      _activeInstruments[account].add(index);
      _accountsWithOpenPositions.add(account);
    }
    _settledOrders[account]++;
  }
}
