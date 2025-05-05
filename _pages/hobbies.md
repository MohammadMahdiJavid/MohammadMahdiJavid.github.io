---
layout: page
title: "Hobbies"
permalink: /hobbies/
---

# Choose Your Adventure 🧭  
*(hobby flow chart)*

```mermaid
flowchart TD
    A([Feeling bored?]) --> B{Pick an activity}

    B --> |🎬 Movies / Series| C[📽️ Stream a movie<br/>or binge a series]
    B --> |🍣 Food outing| D[🍜 Grab a bite<br/>somewhere tasty]
    B --> |🚶 Talk & Walk| E[🌳 Stroll by the river<br/>(unless ☀️ > 30 °C)]
    B --> |🧩 Puzzle / DIY| F[👷 Build that project<br/>you keep delaying]
    B --> |🧠 Deep Talks| G[📊 Discuss investments,<br/>science, politics]
    B --> |🌍 Language / Culture| H[🗣️ Learn a new language<br/>or culture quirk]
    B --> |😢 Need to vent?| I{Expectations check}
    B --> |💡 Challenge yourself| K[🚀 Learn something brand-new<br/>together]

    I --> |Sure| J[🙂 I’ll listen,<br/>but keep expectations low]
    I --> |Skip| B

    classDef startEnd fill:#dfe6e9,stroke:#2d3436,stroke-width:2px;
    class A startEnd;

