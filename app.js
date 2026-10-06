"use strict";

const CANDY_VALUES = { XS: 100, S: 800, M: 3000, L: 10000, XL: 30000 };
const CANDY_SIZES = ["XL", "L", "M", "S", "XS"];
const TYPE_COLORS = {
  normal: "#A8A77A",
  fire: "#EE8130",
  water: "#6390F0",
  electric: "#F7D02C",
  grass: "#7AC74C",
  ice: "#96D9D6",
  fighting: "#C22E28",
  poison: "#A33EA1",
  ground: "#E2BF65",
  flying: "#A98FF3",
  psychic: "#F95587",
  bug: "#A6B91A",
  rock: "#B6A136",
  ghost: "#735797",
  dragon: "#6F35FC",
  dark: "#705746",
  steel: "#B7B7CE",
  fairy: "#D685AD",
};
const cardsElement = document.querySelector("#cards");
const statusElement = document.querySelector("#status");
const pokemonNames = [];
let pokemonData = {};
let saveTimer;

function expAtLevel(growthRate, level) {
  if (level === 1) return 0;
  let exp;
  switch (growthRate) {
    case "Erratic":
      if (level < 50) exp = level ** 3 * (100 - level) / 50;
      else if (level < 68) exp = level ** 3 * (150 - level) / 100;
      else if (level < 98) exp = level ** 3 * ((1911 - 10 * level) / 3) / 500;
      else exp = level ** 3 * (160 - level) / 100;
      break;
    case "Fast":
      exp = 4 * level ** 3 / 5;
      break;
    case "Medium Fast":
      exp = level ** 3;
      break;
    case "Medium Slow":
      exp = 6 * level ** 3 / 5 - 15 * level ** 2 + 100 * level - 140;
      break;
    case "Slow":
      exp = 5 * level ** 3 / 4;
      break;
    case "Fluctuating":
      if (level < 15) exp = level ** 3 * ((level + 1) / 3 + 24) / 50;
      else if (level < 36) exp = level ** 3 * (level + 14) / 50;
      else exp = level ** 3 * (level / 2 + 32) / 50;
      break;
    default:
      throw new Error(`Unknown growth rate: ${growthRate}`);
  }
  return Math.max(0, Math.floor(exp));
}

function calculateCandies(requiredExp) {
  if (requiredExp < 0) throw new Error("EXP needed cannot be negative.");
  const remainingExp = requiredExp;
  const candies = {};
  for (const size of ["XL", "L", "M", "S"]) {
    candies[size] = Math.floor(requiredExp / CANDY_VALUES[size]);
    requiredExp %= CANDY_VALUES[size];
  }
  candies.XS = Math.ceil(requiredExp / CANDY_VALUES.XS);

  for (const [smaller, larger, fusionCount] of [
    ["XS", "S", 6],
    ["S", "M", 3],
    ["M", "L", 3],
    ["L", "XL", 3],
  ]) {
    candies[larger] += Math.floor(candies[smaller] / fusionCount);
    candies[smaller] %= fusionCount;
  }

  const minimumUnits = Math.ceil(remainingExp / CANDY_VALUES.XS);
  const items = Object.entries(candies).flatMap(([size, count]) =>
    Array.from({ length: count }, () => ({
      size,
      value: CANDY_VALUES[size] / CANDY_VALUES.XS,
    })),
  );
  const reachable = [1n];
  for (const item of items) {
    reachable.push(reachable.at(-1) | (reachable.at(-1) << BigInt(item.value)));
  }

  let aboveTarget = reachable.at(-1) >> BigInt(minimumUnits);
  let closestUnits = minimumUnits;
  while ((aboveTarget & 1n) === 0n) {
    aboveTarget >>= 1n;
    closestUnits += 1;
  }

  const optimized = Object.fromEntries(Object.keys(CANDY_VALUES).map((size) => [size, 0]));
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if ((reachable[index] & (1n << BigInt(closestUnits))) !== 0n) continue;
    optimized[item.size] += 1;
    closestUnits -= item.value;
  }
  return optimized;
}

function getPokemonTypeNames(name) {
  const entry = pokemonData[name];
  return entry ? entry.types : [];
}

function typeForeground(hexColor) {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hexColor.slice(start, start + 2), 16));
  const luminance = channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114;
  return luminance > 150 ? "#17212B" : "#FFFFFF";
}

function saveCards() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const state = [...cardsElement.querySelectorAll(".pokemon-card")].map((card) => ({
        pokemon: card.querySelector(".pokemon-input").value,
        current: card.querySelector('[data-level="current"]').value,
        target: card.querySelector('[data-level="target"]').value,
      }));
      localStorage.setItem("pokemon-exp-candy-cards", JSON.stringify(state));
      statusElement.textContent = "";
    } catch (error) {
      statusElement.textContent = `Could not save on this device: ${error.message}`;
    }
  }, 250);
}

function updateCard(card) {
  const name = card.querySelector(".pokemon-input").value.trim();
  const typeBadges = card.querySelector(".type-badges");
  const candyCounts = card.querySelectorAll(".candy-count");
  const summary = card.querySelector(".exp-summary");
  const types = getPokemonTypeNames(name);

  typeBadges.replaceChildren();
  for (const type of types) {
    const badge = document.createElement("span");
    const color = TYPE_COLORS[type];
    badge.className = "type-badge";
    badge.textContent = type[0].toUpperCase() + type.slice(1);
    badge.style.backgroundColor = color;
    badge.style.color = typeForeground(color);
    typeBadges.append(badge);
  }
  card.querySelector(".card-title").textContent = name || "Pokémon";

  const current = card.querySelector('[data-level="current"]').value;
  const target = card.querySelector('[data-level="target"]').value;
  const clearCandyCounts = () => candyCounts.forEach((element) => {
    element.textContent = "0";
  });
  if (!name || !pokemonData[name]) {
    summary.textContent = name ? "Choose a Pokémon from the suggestions." : "Choose a Pokémon and enter both levels.";
    clearCandyCounts();
    return;
  }
  if (current === "" || target === "") {
    summary.textContent = "Enter both levels to see the candy count.";
    clearCandyCounts();
    return;
  }

  const currentLevel = Number(current);
  const targetLevel = Number(target);
  if (!Number.isInteger(currentLevel) || !Number.isInteger(targetLevel)
      || currentLevel < 1 || currentLevel > 100 || targetLevel < 1 || targetLevel > 100) {
    summary.textContent = "Levels must be whole numbers from 1 to 100.";
    clearCandyCounts();
    return;
  }
  if (targetLevel < currentLevel) {
    summary.textContent = "The goal level cannot be lower than the current level.";
    clearCandyCounts();
    return;
  }

  const requiredExp = expAtLevel(pokemonData[name].growth, targetLevel)
    - expAtLevel(pokemonData[name].growth, currentLevel);
  const candies = calculateCandies(requiredExp);
  const providedExp = Object.entries(candies).reduce(
    (total, [size, count]) => total + CANDY_VALUES[size] * count,
    0,
  );
  for (const element of candyCounts) {
    const size = element.dataset.size;
    element.textContent = String(candies[size]);
  }
  summary.textContent = `Need ${requiredExp.toLocaleString()} EXP · Candies give ${providedExp.toLocaleString()} (${(providedExp - requiredExp).toLocaleString()} extra)`;
}

function hideSuggestions(card) {
  const list = card.querySelector(".suggestions");
  list.hidden = true;
  card.querySelector(".pokemon-input").setAttribute("aria-expanded", "false");
  list.replaceChildren();
}

function showSuggestions(card) {
  const input = card.querySelector(".pokemon-input");
  const list = card.querySelector(".suggestions");
  const query = input.value.trim().toLocaleLowerCase();
  if (!query) {
    hideSuggestions(card);
    return;
  }

  const matches = pokemonNames.filter((name) => name.toLocaleLowerCase().includes(query));
  list.replaceChildren();
  if (!matches.length) {
    hideSuggestions(card);
    return;
  }

  for (const name of matches) {
    const option = document.createElement("button");
    option.className = "suggestion";
    option.type = "button";
    option.textContent = name;
    option.addEventListener("pointerdown", (event) => event.preventDefault());
    option.addEventListener("click", () => {
      input.value = name;
      hideSuggestions(card);
      updateCard(card);
      saveCards();
      input.focus();
    });
    list.append(option);
  }
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function makeLevelField(labelText, key, value) {
  const field = document.createElement("div");
  field.className = "level-field";
  const label = document.createElement("label");
  const input = document.createElement("input");
  const id = `level-${crypto.randomUUID()}`;
  label.htmlFor = id;
  label.textContent = labelText;
  input.id = id;
  input.className = "level-input";
  input.dataset.level = key;
  input.type = "number";
  input.inputMode = "numeric";
  input.min = "1";
  input.max = "100";
  input.step = "1";
  input.value = value;
  input.setAttribute("aria-label", labelText);
  field.append(label, input);
  return { field, input };
}

function addCard(saved = {}) {
  const card = document.createElement("article");
  card.className = "pokemon-card";
  const heading = document.createElement("header");
  heading.className = "card-heading";
  const title = document.createElement("span");
  title.className = "card-title";
  const badges = document.createElement("span");
  badges.className = "type-badges";
  const remove = document.createElement("button");
  remove.className = "remove-button";
  remove.type = "button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "Remove Pokémon");
  heading.append(title, badges, remove);

  const content = document.createElement("div");
  content.className = "card-content";
  const pokemonField = document.createElement("div");
  pokemonField.className = "pokemon-field";
  const pokemonInput = document.createElement("input");
  pokemonInput.className = "pokemon-input";
  pokemonInput.type = "text";
  pokemonInput.autocomplete = "off";
  pokemonInput.placeholder = "Search Pokémon…";
  pokemonInput.setAttribute("role", "combobox");
  pokemonInput.setAttribute("aria-autocomplete", "list");
  pokemonInput.setAttribute("aria-expanded", "false");
  pokemonInput.setAttribute("aria-label", "Pokémon name");
  const suggestions = document.createElement("div");
  suggestions.className = "suggestions";
  suggestions.hidden = true;
  pokemonField.append(pokemonInput, suggestions);

  const levelRow = document.createElement("div");
  levelRow.className = "level-row";
  const currentField = makeLevelField("Current level", "current", saved.current || "");
  const targetField = makeLevelField("Goal level", "target", saved.target || "");
  levelRow.append(currentField.field, targetField.field);

  const divider = document.createElement("div");
  divider.className = "divider";
  const candyCaption = document.createElement("p");
  candyCaption.className = "candy-caption";
  candyCaption.textContent = "EXP candies";
  const candyList = document.createElement("div");
  candyList.className = "candy-list";
  for (const size of CANDY_SIZES) {
    const item = document.createElement("div");
    item.className = "candy";
    const sizeLabel = document.createElement("span");
    sizeLabel.className = "candy-size";
    sizeLabel.textContent = size;
    const count = document.createElement("span");
    count.className = "candy-count";
    count.dataset.size = size;
    count.textContent = "0";
    item.append(sizeLabel, count);
    candyList.append(item);
  }
  const summary = document.createElement("p");
  summary.className = "exp-summary";
  content.append(pokemonField, levelRow, divider, candyCaption, candyList, summary);
  card.append(heading, content);
  cardsElement.append(card);

  pokemonInput.value = saved.pokemon || "";
  pokemonInput.addEventListener("input", () => {
    showSuggestions(card);
    updateCard(card);
    saveCards();
  });
  pokemonInput.addEventListener("focus", () => showSuggestions(card));
  pokemonInput.addEventListener("keydown", (event) => {
    const options = [...suggestions.querySelectorAll(".suggestion")];
    const selectedIndex = options.findIndex((option) => option.getAttribute("aria-selected") === "true");
    if (event.key === "Escape") {
      hideSuggestions(card);
    } else if (event.key === "ArrowDown" && options.length) {
      event.preventDefault();
      const next = Math.min(selectedIndex + 1, options.length - 1);
      options.forEach((option, index) => option.setAttribute("aria-selected", String(index === next)));
      options[next].scrollIntoView({ block: "nearest" });
    } else if (event.key === "ArrowUp" && options.length) {
      event.preventDefault();
      const next = Math.max(selectedIndex <= 0 ? 0 : selectedIndex - 1, 0);
      options.forEach((option, index) => option.setAttribute("aria-selected", String(index === next)));
      options[next].scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && options.length) {
      event.preventDefault();
      const option = options[selectedIndex < 0 ? 0 : selectedIndex];
      option.click();
    }
  });
  pokemonInput.addEventListener("blur", () => {
    window.setTimeout(() => hideSuggestions(card), 120);
  });
  for (const input of [currentField.input, targetField.input]) {
    input.addEventListener("input", () => {
      updateCard(card);
      saveCards();
    });
    input.addEventListener("change", () => {
      updateCard(card);
      saveCards();
    });
  }
  remove.addEventListener("click", () => {
    card.remove();
    if (!cardsElement.children.length) addCard();
    saveCards();
  });
  updateCard(card);
  return card;
}

async function startApp() {
  try {
    const response = await fetch("./pokemon_data.json");
    if (!response.ok) throw new Error(`Pokémon data request failed (${response.status}).`);
    pokemonData = await response.json();
    pokemonNames.push(...Object.keys(pokemonData).sort((a, b) => a.localeCompare(b)));

    let savedCards = [];
    try {
      const saved = localStorage.getItem("pokemon-exp-candy-cards");
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) throw new Error("Saved Pokémon list is invalid.");
        savedCards = parsed.filter((item) => item && typeof item === "object");
      }
    } catch (error) {
      statusElement.textContent = `Could not restore the saved list: ${error.message}`;
    }
    for (const saved of savedCards) addCard(saved);
    if (!cardsElement.children.length) addCard();
    document.querySelector("#add-pokemon").addEventListener("click", () => {
      const card = addCard();
      saveCards();
      card.querySelector(".pokemon-input").focus();
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    statusElement.textContent = "";

    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("./service-worker.js").catch((error) => {
        statusElement.textContent = `Offline install support is unavailable: ${error.message}`;
      });
    }
  } catch (error) {
    statusElement.textContent = `Could not start the calculator: ${error.message} Open it from a web server or hosted site.`;
  }
}

startApp();
