/**************************************************
*
*   Using:
*     yahoo.com (Weather)
*     epa.gov (US UV Index)
*
* *************************************************
*
*   Example weather data:
*     {
*       location:
*         {
*           city: 'Philadelphia',
*           country: 'United States',
*           region: 'PA',
*           lat: '40.01',
*           long: '-75.13'
*         },
*       astronomy:
*         {
*           sunrise: '6:14 am',
*           sunset: '7:51 pm'
*         },
*       currently:
*         {
*           code: '30',
*           date: 'Tue, 18 Aug 2015 12:53 pm EDT',
*           temp: '89',
*           text: 'Partly Cloudy',
*           altTemp: '32',
*           uv: '8'
*         },
*       today:
*         {
*           code: '30',
*           date: '18 Aug 2015',
*           day: 'Tue',
*           high: '91',
*           low: '72',
*           text: 'Partly Cloudy',
*           altHigh: '33',
*           altLow: '22',
*           highUV: '9',
*           uv:
*             [
*               {
*                 hour: '07',
*                 uv: '0'
*               },
*               {
*                 hour: '08',
*                 uv: '1'
*               },
*               ...
*             ]
*         },
*       forecast:
*         [
*           {
*             code: '38',
*             date: '19 Aug 2015',
*             day: 'Wed',
*             high: '90',
*             low: '72',
*             text: 'PM Thunderstorms',
*             altHigh: '32',
*             altLow: '22'
*           },
*           {
*             code: '38',
*             date: '20 Aug 2015',
*             day: 'Thu',
*             high: '85',
*             low: '71',
*             text: 'PM Thunderstorms',
*             altHigh: '29',
*             altLow: '22'
*           },
*           ...
*         ]
*     }
*
**************************************************/

$(document).ready(function() {

  var codes =
        {
          'Storms': [0,1,2,3,4,37,38,39,40,45,47],
          'WinteryPrecip': [5,6,7,8,10,17,18,35],
          'Rain': [9,11,12],
          'Snow': [13,14,15,16,41,42,43,46],
          'Dust': [19],
          'Fog': [20,21,22],
          'Wind': [23,24],
          'Cold': [25],
          'Clouds': [26,27,28,29,30,44],
          'Clear': [31,32,33,34],
          'Hot': [36]
        },
      metric = false,
      bgClass,
      loadedWeather;

  // Use browser to determine location.
  if(navigator) {
    navigator.geolocation.getCurrentPosition(function(position) {
      loadWeather(position.coords.latitude + ',' + position.coords.longitude);
    });
  }

  // On form submit, load weather data for location.
  $('#search').on('submit', function() {
    loadWeather($('#search input').val());
    return false;  // Prevent the form from reloading the page.
  });

  // On unit button press, toggle metric/imperial.
  $('#unitToggle').on('click', function() {
    metric = !metric;
    if (metric) {
      $('#unitToggle').text('°F');
    } else {
      $('#unitToggle').text('°C');
    }
    displayWeather(loadedWeather);
  });

  function loadWeather(location) {
    var weather = {},
        yahooURL = 'https://query.yahooapis.com/v1/public/yql?format=json&q=select * from weather.forecast where woeid in (select woeid from geo.placefinder where text="' + location + '" and gflags="R" limit 1)';
    $.ajax({
      url: yahooURL
    }).done(function(yahooData) {
      var channel = yahooData.query.results.channel;

      weather.link = channel.link;
      weather.location = channel.location;  // city, country, region, (lat, long)
      weather.location.lat = channel.item.lat;
      weather.location.long = channel.item.long;
      weather.astronomy = channel.astronomy;  // sunrise, sunset
      weather.currently = channel.item.condition; // code, date, temp, text, (altTemp, uv)
      weather.currently.altTemp = fahrenheitToCelsius(parseInt(weather.currently.temp)).toString();
      weather.today = channel.item.forecast.shift(); // code, date, day, high, low, text, (altHigh, altLow, uv, highUV)
      weather.today.altHigh = fahrenheitToCelsius(parseInt(weather.today.high)).toString();
      weather.today.altLow = fahrenheitToCelsius(parseInt(weather.today.low)).toString();
      weather.forecast = []; // code, date, day, high, low, text, (altHigh, altLow)
      $(channel.item.forecast).each(function() {
        $(this)[0].altHigh = fahrenheitToCelsius(parseInt($(this)[0].high)).toString();
        $(this)[0].altLow = fahrenheitToCelsius(parseInt($(this)[0].low)).toString();
        weather.forecast.push($(this)[0]);
      });
      // weather.units = channel.units;  // distance, pressure, speed, temperature
      // weather.wind = channel.wind;  // chill, direction, speed
      // weather.atmosphere = channel.atmosphere;  // humidity, pressure, rising, visibility

      // If US, add UV index before storing and displaying weather data.
      if (weather.location.country === 'United States') {
        var epaURL = 'http://iaspub.epa.gov/enviro/efservice/getEnvirofactsUVHOURLY/CITY/' + weather.location.city + '/STATE/' + weather.location.region + '/xml';
        $.ajax({
          url: epaURL
        }).done(function(epaData) {
          // If no data for location.
          if (!epaData) {
            return undefined;
          }

          // UV Index hourly forecast.
          weather.today.uv = [];
          $(epaData).find('getEnvirofactsUVHOURLY').each(function() {
            var re = /(\d{2})\s(am|pm)/i.exec($(this).contents('date_time').text());

            // Convert times to 24 hour format.
            // Handle 12 AM and 12 PM.
            if(re[1] === '12') {
              if(/am/i.test(re[2])) {
                re[1] = '00';
              }
            }
            // Handle the remaining times.
            else {
            if(/pm/i.test(re[2])) {
                re[1] = (parseInt(re[1]) + 12).toString();
              }
            }

            weather.today.uv.push({
              hour: re[1],
              uv: $(this).contents('uv_value').text()
            });
          });

          // Add current and high UV indices.
          // Determine current hour so we can find the correct UV index for the current time.
          var currentHour = parseInt(convertTo24(weather.currently.date));
          currentHour = Math.round(currentHour / 100).toString();
          if (currentHour.length < 2) {
            currentHour = '0' + currentHour;
          }
          // Reduce the hourly uv indices to the highest and assign to highUV,
          // while simultaneously checking for the uv index associated with the current time and assigning it to currently uv.
          weather.today.highUV = weather.today.uv.reduce(function(acc, curr) {
            if (curr.hour === currentHour) {
              weather.currently.uv = curr.uv;
            }

            if (parseInt(curr.uv) > parseInt(acc)) {
              acc = curr.uv;
            }

            return acc;
          }, '0');

        }).always(function() {
          loadedWeather = weather;
          displayWeather(weather);
          changeBackground(weather);
        });
      }
      // If not US, just store and display weather data.
      else {
        loadedWeather = weather;
        displayWeather(weather);
        changeBackground(weather);
      }
    });
  }

  function displayWeather(weather) {
    if (weather === undefined) {
      return undefined;
    }

    // Set current temperature.
    $('#current p:first-child').
    replaceWith('<p><a href="' + weather.link + '">' + (metric ? weather.currently.altTemp : weather.currently.temp) + '<sup>&deg;' + (metric ? 'C' : 'F') + '</sup></a></p>');
    // Set current conditions.
    $('#current p:last-child').
    replaceWith('<p><a href="' + weather.link + '">' + weather.currently.text + '</a></p>');
    // Set high.
    $('#details div:first-child p:first-child').
    replaceWith('<p><a href="' + weather.link + '"><b>High:</b> ' + (metric ? weather.today.altHigh : weather.today.high) + '<sup>&deg;</sup></a></p>');
    // Set low.
    $('#details div:first-child p:last-child').
    replaceWith('<p><a href="' + weather.link + '"><b>Low:</b> ' + (metric ? weather.today.altLow : weather.today.low) + '<sup>&deg;</sup></a></p>');
    // Set day conditions.
    $('#details div:last-child p:first-child').
    replaceWith('<p><a href="' + weather.link + '">' + weather.today.text + '</a></p>');
    // Set high UV index.
    var uvHighHTML = '';
    if (weather.today.highUV) {
      uvHighHTML = '<p><a href="' + weather.link + '"><b>UV High:</b> ' + weather.today.highUV + '<small>/12</small></a></p>';
    }
    $('#details div:last-child p:last-child').replaceWith(uvHighHTML);
    // Set the location name.
    $('#location').
    replaceWith('<p id="location"><a href="' + weather.link + '">' + weather.location.city + ', ' + weather.location.region + '</a></p>');
  }

  function changeBackground(weather) {
    // Local time.
    var time = new Date();
    time = parseInt(time.getHours().toString() + time.getMinutes().toString());

    // Sunrise and sunset times.
    var sunrise = parseInt(convertTo24(weather.astronomy.sunrise));
    var sunset = parseInt(convertTo24(weather.astronomy.sunset));

    // Determine bgClass prefix.
    var prefix = (time > sunrise && time < sunset) ? 'day' : 'night';

    // Determine bgClass suffix.
    var suffix;
    for(var prop in codes) {
      if(codes[prop].some(function(e, i, arr) { return e === 28 } )) {
        suffix = prop;
        break;
      }
    }

    // Clear existing background.
    if(bgClass) {
      $('body').removeClass(bgClass);
    }

    // Assign new background.
    bgClass = prefix + suffix;
    $('body').addClass(bgClass);
  }

  /*************************************
  * Helper functions.
  *************************************/

  function convertTo24(time) {
    if (typeof time !== 'string') {
      time.toString();
    }

    time = /([0-2]?[0-9]):([0-5][0-9])\s?(am|pm)?/i.exec(time);

    if(time[3] === 'pm' && time[1] !== '12') {
      time[1] = (parseInt(time[1]) + 12).toString();
    }

    if(time[1],length === 1) {
      time[1] = '0' + time[1];
    }

    return time[1] + time[2];
  }

  function fahrenheitToCelsius(f) {
    return Math.round((f - 32) / 1.8);
  }
});
