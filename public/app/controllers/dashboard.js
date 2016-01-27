//
// Site wide controller.
//
app.controller('DashboardCtrl', function ($scope, $http, $location, $timeout, $filter) 
{  
  $scope.$parent.tab = 'dashboard';
  
  $scope.quotes = {}
  $scope.quote_first_run = false;
  
  $scope.chart_sym = 'spy';
  $scope.chart_range = 'today-1'; 
  
  $scope.orders = [];

  $scope.quotes = {};  
  $scope.watchlist = [];
  $scope.watchlist_timestamp = ''; 
  
  $scope.positions_stocks = [];
  $scope.positions_options = [];
  $scope.positions_multi_leg = [];    

  // When the socket connects (or reconnects);
  $scope.$on('Status:connected', function (event, args) {    
    $scope.chart_refresh();
  });

  // Catch Websocket event - Timmer:60seconds - just a timer that fires every 60 seconds 
  $scope.$on('Timmer:60seconds', function (event, args) { 
    
    // Refresh Timesales chart
    $scope.chart_refresh();
    
  });

  // Catch Websocket event - Quotes:get_quotes
  $scope.$on('Quotes:get_quote', function (event, args) {
    
    // Wait for the first AJAX call before accepting websockets.
    if(! $scope.quote_first_run)
    {
      return false;
    }
        
    $scope.quotes[args.data.symbol] = args.data;
    $scope.watchlist_timestamp = args.timestamp;
    $scope.$apply();
  });

  // Catch a websocket event - Positions:refresh
  // Since positions are complex the websocket just
  // tells us when the the positions change so we can
  // make an api call to the server and get the updated position.
  $scope.$on('Positions:refresh', function (event, args) {  
    $scope.get_positions_by_types();
  });
  
  // Catch Websocket event - Orders:get_open_orders
  $scope.$on('Orders:open', function (event, args) {
    $scope.orders = JSON.parse(args.data).orders.order;
    $scope.$apply();
  });
  
  // See if we show a spread or not. This is useful for when a spread expires worthless
  $scope.show_spread = function (spread)
  {
    if(! $scope.quotes[spread.legs[0]['symbol']])
    {
      return false;
    }
    
    return true;    
  }
  
  // Figure out gain / loss of a spread.
  $scope.spread_gain_loss = function (spread)
  {    
    if(! $scope.quotes[spread.legs[1]['symbol']])
    {
      return 0;
    }
    
    return spread.credit - ((($scope.quotes[spread.legs[1]['symbol']].ask - $scope.quotes[spread.legs[0]['symbol']].bid) * 100) * spread.lots)       
  }
  
  // Figure out spread precent_to_close
  $scope.spread_precent_to_close = function (spread)
  {    
    if(! $scope.quotes[spread.legs[1]['symbol']])
    {
      return 0;
    }
    
    return ($scope.spread_gain_loss(spread) / spread.credit) * 100;     
  }  
  
  // Figure out percent away.
  $scope.percent_away = function (price, underlying)
  {
    if(! $scope.quotes[underlying])
    {
      return '';
    }
    
    return ((parseFloat($scope.quotes[underlying].last) - parseFloat(price)) / ((parseFloat($scope.quotes[underlying].last) + parseFloat(price)) / 2)) * 100;
  }
  
  // Get the total cost baises of the positions
  $scope.get_positions_get_total_value = function ()
  {        
    var total = 0;
    
    for(var i in $scope.positions_stocks)
    {
      total = total +  (parseFloat($scope.positions_stocks[i].quote.last) * parseFloat($scope.positions_stocks[i].quantity));
    }
    
    return total;
  }
  
  // Get the total value of the positions
  $scope.get_positions_get_total_cost_baises = function ()
  {
    var total = 0;
    
    for(var i in $scope.positions_stocks)
    {
      total = total +  parseFloat($scope.positions_stocks[i].cost_basis);
    }
    
    return total;
  }  
  
  // Return total credit of positions.
  $scope.total_credit = function ()
  {
    var total = 0;
    
    for(var i in $scope.positions_multi_leg)
    {
      if(! $scope.quotes[$scope.positions_multi_leg[i].legs[1]['symbol']])
      {
        continue;
      }
      
      total = total + parseFloat($scope.positions_multi_leg[i].credit);
    }
    
    return total;
  }  
  
  // Close credit option trade
  $scope.close_credit_option_trade = function (row, debit)
  {
    var order = {
      class: 'multileg',
      symbol: 'SPY',
      duration: 'gtc',
      type: 'debit',
      preview: 'true',
      price: debit,
      
      side: [
        'sell_to_close',
        'buy_to_close'
      ],
      
      option_symbol: [
        row.legs[0].symbol,
        row.legs[1].symbol
      ],
      
      quantity: [ row.legs[0].quantity, row.legs[0].quantity ]
    };
    
    // Send a request for preview for the order.
    $http.post('/api/v1/trades/preview_trade', { order: order }).success(function (json) {
      
      if(! json.status)
      {
        alert(json.errors[0].error);
        return false;
      }
      
      json.data.action = 'close';
      json.data.lots = row.legs[0].quantity;
      json.data.buy_leg = row.legs[1].quote.description; 
      json.data.sell_leg = row.legs[0].quote.description;       
      $scope.$emit('order-preview:credit-spreads', { preview: json.data, order: order });
    });
  }
  
  // Clicked on the watch list.
  $scope.watchlist_click = function (sym)
  {
    $scope.chart_sym = sym;
    $scope.chart_refresh();
  }
  
  // Change the range on the chart.
  $scope.chart_refresh = function ()
  {
    // Put chart into loading state.
    var chart = $('#chart').highcharts();
    chart.showLoading('Loading data from server...');        
    
    // Get data.
    $http.get('/api/v1/quotes/timesales?preset=' + $scope.chart_range + '&symbol=' + $scope.chart_sym).success(function (json) {
      
      // Setup the data.
      var data = [];
      
      for(var i = 0; i < json.data.length; i++)
      {
        data.push({
          x: (json.data[i].timestamp * 1000) - (60 * 60 * 8 * 1000), // UTM time (have to update this with day light savings time).
          open: json.data[i].open,
          high: json.data[i].high,
          low: json.data[i].low,
          close: json.data[i].close,
          name: $scope.chart_sym.toUpperCase(),
          //color: '#00FF00'
        });
      }
      
      // Hide Loader
      var chart = $('#chart').highcharts();
      chart.showLoading('Loading data from server...');  
      chart.series[0].setData(data);
      chart.xAxis[0].setExtremes();
      chart.hideLoading();      
    });
  }
  
  // Setup stock chart at the top of the page.
  $scope.setup_chart = function ()
  {        
    // create the chart
    $('#chart').highcharts('StockChart', {
      title: { text: '' },
      credits: { enabled: false },
    
      rangeSelector: { enabled: false },
      
      yAxis: {
        startOnTick: false,
        endOnTick: false,
        minPadding: 0.1,
        maxPadding: 0.1          
      },  
      
      xAxis : {
        //events : { afterSetExtremes : afterSetExtremes },
        minRange: 3600 * 1000 // one hour
      },              
    
      series : [{
        name : 'SPY',
        type: 'candlestick',
        data: [],
        turboThreshold: 0,
        tooltip: { valueDecimals: 2 },
        dataGrouping: { enabled: false }
      }]
    
    });    
    
    // Load data.
    $timeout(function () { $scope.chart_refresh(); }, 1000);    
  }
    
  $scope.setup_chart();
  
  // Get watchlist
  $scope.get_watchlist = function ()
  {
    $http.get('/api/v1/me/get_watchlist').success(function (json) {
      $scope.watchlist = json.data;
    });
  }
  
  $scope.get_watchlist();
  
  // Send a request to API all our positions
  $scope.get_positions_by_types = function ()
  {  
    $http.get('/api/v1/positions/get_by_types').success(function (json) {
      $scope.positions_stocks = json.data.stock;
      $scope.positions_options = json.data.options;
      $scope.positions_multi_leg = json.data.multi_leg;       
    });
  }
  
  $scope.get_positions_by_types();
  
  // Get open orders.
  $http.get('/api/v1/orders/get_open').success(function (json) {
    $scope.orders = json.data;       
  });
  
  // Get quotes. We do this via API call first. Then the websocket takes over.
  $scope.get_quotes = function ()
  {
    // Get the quote data and then loop over it.
    $http.get('/api/v1/quotes/get_account_quotes').success(function (json) {
      
      for(var i = 0; i < json.data.length; i++)
      {
        $scope.quotes[json.data[i].symbol] = json.data[i];      
      }
      
      $scope.quote_first_run = true;

    });
  }
  
  $scope.get_quotes(); 
  
});