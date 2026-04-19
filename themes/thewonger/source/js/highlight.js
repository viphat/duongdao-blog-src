document.addEventListener("DOMContentLoaded", function () {
  var currentActiveId = null;
  var returnPosition = null;

  function clearFootnoteHighlights() {
    document.querySelectorAll(".footnote-active").forEach(function (target) {
      target.classList.remove("footnote-active");
      var returnLink = target.querySelector(".return-link");
      if (returnLink) returnLink.remove();
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (event) {
      var targetId = link.getAttribute("href");
      if (!targetId || targetId === "#") return;

      var targetElement = document.getElementById(decodeURIComponent(targetId.slice(1)));
      if (!targetElement) return;

      event.preventDefault();
      returnPosition = window.pageYOffset || document.documentElement.scrollTop;

      if (currentActiveId !== targetId) clearFootnoteHighlights();
      currentActiveId = targetId;

      if (!targetElement.classList.contains("footnote-active")) {
        targetElement.classList.add("footnote-active");

        var returnLink = document.createElement("a");
        returnLink.href = "#";
        returnLink.textContent = "Quay lại.";
        returnLink.className = "return-link";
        returnLink.addEventListener("click", function (returnEvent) {
          returnEvent.preventDefault();
          window.scrollTo({ top: returnPosition, behavior: "smooth" });
          clearFootnoteHighlights();
        });

        targetElement.append(returnLink);
      }

      targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
});
