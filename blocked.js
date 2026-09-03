document.querySelector("#back").addEventListener("click", () => history.length > 1 ? history.back() : location.href = "about:blank");
