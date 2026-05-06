(function () {
  var body = document.body;
  if (!body) return;

  var apiBase = body.getAttribute("data-analytics-api");
  if (!apiBase) return;

  var path = normalizePath(body.getAttribute("data-analytics-path") || window.location.pathname);
  var title = body.getAttribute("data-analytics-title") || document.title || "";
  var pageType = body.getAttribute("data-analytics-page-type") || "page";
  var postViewElements = document.querySelectorAll("[data-post-page-views]");
  var totalViewElements = document.querySelectorAll("[data-total-page-views]");

  function normalizePath(value) {
    try {
      var url = new URL(value, window.location.origin);
      var pathname = url.pathname || "/";
      pathname = pathname.replace(/\/index\.html$/i, "/").replace(/\.html$/i, "");
      if (pathname.length > 1) pathname = pathname.replace(/\/+$/, "/");
      return pathname.charAt(0) === "/" ? pathname : "/" + pathname;
    } catch (error) {
      return window.location.pathname || "/";
    }
  }

  function endpoint(route) {
    return apiBase.replace(/\/+$/, "") + route;
  }

  function formatNumber(value) {
    var number = Number(value || 0);
    return new Intl.NumberFormat("vi-VN").format(number);
  }

  function renderStats(stats) {
    if (!stats) return;

    postViewElements.forEach(function (element) {
      element.textContent = formatNumber(stats.views) + " lượt xem";
    });

    totalViewElements.forEach(function (element) {
      element.textContent = formatNumber(stats.totalPageViews) + " tổng lượt xem";
    });
  }

  function requestPageview() {
    return fetch(endpoint("/pageview"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        path: path,
        title: title,
        pageType: pageType
      }),
      keepalive: true
    }).then(function (response) {
      if (!response.ok) throw new Error("Analytics request failed");
      return response.json();
    });
  }

  function requestSummary() {
    return fetch(endpoint("/summary?path=") + encodeURIComponent(path), {
      headers: {
        Accept: "application/json"
      }
    }).then(function (response) {
      if (!response.ok) throw new Error("Analytics summary failed");
      return response.json();
    });
  }

  function loadAnalytics() {
    requestPageview()
      .then(renderStats)
      .catch(function () {
        requestSummary().then(renderStats).catch(function () {});
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAnalytics, { once: true });
  } else {
    loadAnalytics();
  }
})();
