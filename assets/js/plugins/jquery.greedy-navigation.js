/*
GreedyNav.js - https://github.com/lukejacksonn/GreedyNav
Licensed under the MIT license - http://opensource.org/licenses/MIT
Copyright (c) 2015 Luke Jackson
*/

$(document).ready(function() {
  var $btn = $("nav.greedy-nav .greedy-nav__toggle");
  var $vlinks = $("nav.greedy-nav .visible-links");
  var $hlinks = $("nav.greedy-nav .hidden-links");

  var numOfItems = 0;
  var totalSpace = 0;
  var closingTime = 1000;
  var breakWidths = [];

  $btn.attr({
    "aria-expanded": "false",
    "aria-controls": $hlinks.attr("id") || "site-nav-hidden-links"
  });
  $hlinks.attr("role", "menu");

  function syncMenuItems() {
    $hlinks.find("a").attr("role", "menuitem");
    $vlinks.find("a").removeAttr("role");
    if ($hlinks.hasClass("hidden")) {
      $btn.attr("aria-expanded", "false");
    }
  }

  function openMenu() {
    if ($hlinks.find("a").length === 0) return false;
    $hlinks.removeClass("hidden");
    $btn.addClass("close").attr("aria-expanded", "true");
    clearTimeout(timer);
    return true;
  }

  function closeMenu(focusButton) {
    $hlinks.addClass("hidden");
    $btn.removeClass("close").attr("aria-expanded", "false");
    clearTimeout(timer);
    if (focusButton) $btn.focus();
  }

  function focusMenuItem(offset) {
    var $items = $hlinks.find("a");
    if ($items.length === 0) return;
    var index = $items.index(document.activeElement);
    if (index < 0) {
      index = offset > 0 ? -1 : 0;
    }
    var next = (index + offset + $items.length) % $items.length;
    $items.eq(next).focus();
  }

  // Get initial state
  $vlinks.children().outerWidth(function(i, w) {
    totalSpace += w;
    numOfItems += 1;
    breakWidths.push(totalSpace);
  });

  var availableSpace, numOfVisibleItems, requiredSpace, timer;

  function visibleLinkGap() {
    var node = $vlinks[0];
    if (!node || !window.getComputedStyle) return 0;

    var style = window.getComputedStyle(node);
    var value = style.columnGap || style.gap || "0";
    var parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function requiredWidthFor(count) {
    if (count <= 0) return 0;
    if (count > breakWidths.length) return Infinity;
    return breakWidths[count - 1] + (visibleLinkGap() * Math.max(0, count - 1));
  }

  function check() {
    // Get instant state
    availableSpace = $vlinks.width() - $btn.width();
    numOfVisibleItems = $vlinks.children().length;
    requiredSpace = requiredWidthFor(numOfVisibleItems);

    // There is not enough space
    if (requiredSpace > availableSpace && numOfVisibleItems > 0) {
      $vlinks
        .children()
        .last()
        .prependTo($hlinks);
      numOfVisibleItems -= 1;
      check();
      // There is more than enough space
    } else if (availableSpace > requiredWidthFor(numOfVisibleItems + 1)) {
      $hlinks
        .children()
        .first()
        .appendTo($vlinks);
      numOfVisibleItems += 1;
      check();
    }
    // Update the button accordingly
    $btn.attr("count", numOfItems - numOfVisibleItems);
    if (numOfVisibleItems === numOfItems) {
      $btn.addClass("hidden");
      closeMenu(false);
    } else {
      $btn.removeClass("hidden");
    }
    syncMenuItems();
  }

  // Window listeners
  $(window).resize(function() {
    check();
  });

  $btn.on("click", function() {
    if ($hlinks.hasClass("hidden")) {
      openMenu();
    } else {
      closeMenu(false);
    }
  });

  $btn.on("keydown", function(event) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (openMenu()) {
        $hlinks.find("a").first().focus();
      }
    }
  });

  $hlinks
    .on("mouseleave", function() {
      // Mouse has left, start the timer
      timer = setTimeout(function() {
        closeMenu(false);
      }, closingTime);
    })
    .on("mouseenter", function() {
      // Mouse is back, cancel the timer
      clearTimeout(timer);
    });

  $hlinks.on("keydown", "a", function(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusMenuItem(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusMenuItem(-1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
    }
  });

  check();
});
