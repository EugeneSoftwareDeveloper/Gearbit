# Lessons with a child: a program from age 6

[Русский](../../user/lessons.md) · **English**

This is a plan of lessons with the robot and Gearbit for a child with a grown-up nearby. There are four levels by age, with 8 lessons each. The plan is built on proven approaches to teaching programming; links to them are at the end, in [Where these ideas come from](#where-these-ideas-come-from).

The ages are a guide. Look not at the birthday but at what the child can already do: do they read on their own, can they handle a mouse, did the tasks of the previous level work out? You can start at any level and step back at any time. The same ideas come up at every level, each time deeper: that's on purpose.

| Level | Age | Where we work | Main ideas |
|---|---|---|---|
| [1. The robot follows commands](#level-1-ages-67-the-robot-follows-commands) | 6–7 | Games without a computer, **Remote**, **Blocks** together with a grown-up | Commands in order, repeating, STOP, a mistake can be found and fixed |
| [2. The robot senses](#level-2-ages-89-the-robot-senses) | 8–9 | **Blocks** on their own | Sensors, "if … else", loops, events, variables |
| [3. Robot engineer](#level-3-ages-1011-robot-engineer) | 10–11 | **Blocks**: the line, experiments, projects; a first look at Python | Complex conditions, measurements, the engineering design cycle |
| [4. Programmer](#level-4-ages-12-programmer) | 12+ | Python or C# | Code as text, functions, data, a big project of their own |

## How a lesson works

Every lesson has five steps:

1. **A warm-up without a computer** (5 minutes). A game where the child gets to be the robot or the programmer. This way a new idea first makes sense to the body and hands, and only then on the screen.
2. **The task.** Short and told as a story: "The car needs to take a letter to the garage without bumping into the cat."
3. **Try it:** first guess, then run, then change. Before running, ask: "What will the robot do now?" Let the child show it with a finger on the floor. Then run it and compare. Then change one number or one block in the program.
4. **Find the mistake.** The robot went the wrong way — that's not a failure, it's a puzzle. How to solve it is in [Bug detective](#bug-detective).
5. **Show and talk.** What worked? What was hard? What will we do next time? Let the child show the robot to someone else and draw or write down the main thing in their notebook.

**Rate yourself with a light.** At the end the child picks a color for the robot in the **Light** card on the **Remote** tab:

- yellow — "I did it with a hint";
- blue — "I can do it myself";
- green — "I can teach someone else".

Feedback to each other is kind: "I liked how you…", "Tell me more about how you came up with…". LEGO Education lessons use this kind of color self-rating and feedback (see [Where to find more activities](#where-to-find-more-activities)).

**If it's hard, make it easier.** Every lesson has an "If it's easy" item. When it's hard:

- the grown-up reads the task aloud;
- take a ready-made example and change one number in it;
- make the task smaller: one side instead of the whole square;
- split the lesson over two days.

**How long.** A rough guide: at 6–7 — 20–30 minutes, with no more than 15 in a row at the screen; at 8–9 — 30–40 minutes; at 10–11 — 40–50; from 12 — 45–60 minutes, and a project of their own over several sessions. One or two lessons a week is better than one long one a month. Stop while the child is still interested, ideally on a success.

**The child holds the mouse.** The child is the driver: they hold the mouse and keyboard. The grown-up is the navigator: reads the task, asks questions, watches safety, but doesn't take the mouse. From 8–9 you can swap roles every 10 minutes or when a timer rings. If two children work together, one drives and the other navigates, then they swap.

## What to prepare

- **Gearbit and the emulator.** Install Gearbit and try the emulator yourself: [Getting started](getting-started.md). Every new program runs in the emulator first, then on the robot.
- **Floor space** of about 2 × 2 meters. Boxes and thick books are walls and obstacles. Remove cables, cups and fragile things.
- **For line following** (levels 3 and 4): a sheet of drawing paper or a light floor and black electrical tape. More in [Line following](line-following.md).
- **An engineer's notebook.** An ordinary notebook: routes, robot drawings, measurement tables, "what broke and how we fixed it". At 6–7 the child mostly draws.
- **Cards for the games without a computer:** arrows "forward", "left", "right", a card "repeat 2 times", "stop". Draw them on cardboard.
- **Settings** (⚙). For young children turn on **Large text**. The power limit for the **Car** is 60 %; for the first lessons you can set it lower.
- **Read the safety rules** before the first lesson: [Safety](safety.md). The main rule for all levels: before a run, the grown-up keeps a hand near the space bar or the **STOP** button.

## Level 1. Ages 6–7: the robot follows commands

**Goal:** the child knows what the robot is made of, drives it confidently from the remote and stops it, understands that a program is commands in order, and can find the "wrong" command.

Blocks in Gearbit are labeled with words, not pictures. If the child doesn't read well yet, the grown-up reads the blocks aloud, and the child recognizes them by color: **Events** are yellow, **Motion** blue, **Lights** purple, **Control** orange. Programs at this level are short: 3–6 blocks.

### 1.1. Building the robot

- **Warm-up:** what is a robot? A robot has a body (motors, wheels), senses (sensors) and a brain (the program). Find your own "sensors" (eyes, ears, hands) and "motors" (muscles).
- **Task:** build the **Car** together. The child finds parts by the picture, the grown-up helps fasten them. Then find the motors, sensors and lights on the finished robot.
- **Talk:** the building instructions are a program too: steps in order. What happens if you put the wheels on before the motor?

### 1.2. The remote and STOP

- **Warm-up:** the "Stop car" game. The child "drives" around the room, the grown-up says "stop" — the child freezes. Then swap.
- **In Gearbit:** the **Remote** tab, the emulator first, then the real robot. Buttons on the screen or arrow keys on the keyboard. The robot moves only while a button is held.
- **Task:** drive up to a toy and stop next to it without touching it. Learn to stop the robot with the space bar and the big red **STOP** button.
- **If it's easy:** drive through a "gate" of two books; drive backward.
- **Talk:** why did the robot stop when the button was released? Why does a robot need a STOP button?

### 1.3. Lights and motors

- **Warm-up:** "mood color": everyone picks a color, the other one guesses which mood it is.
- **In Gearbit:** the **Light** and **Motors** cards on the **Remote** tab.
- **Task:** color the lights in your mood color. Put the robot on a box so the wheels hang in the air, and turn on the motors one by one with a slider: which wheel spins? Keep fingers away from the wheels. Write in the notebook which motor is M1 and which is M2.
- **Talk:** did the robot choose the color itself, or was it told? Who tells the robot what to do?

### 1.4. Robot dad (without a computer)

- **Game:** the child is the programmer, the grown-up is the robot. The robot understands only commands from the cards: "step forward", "turn left", "turn right". The robot follows them exactly and literally: "left" means turn on the spot, not walk.
- **Task:** the child lays out cards in a row so that the "robot" gets to the sofa. Then the robot follows the cards one by one. Didn't get there? Look for an extra or missing card. Then swap.
- **If it's easy:** walk around a chair; bring a toy ("pick up" is a new card).
- **Talk:** what was hard? Why didn't the robot figure out by itself where to go?

### 1.5. The first program

- **Warm-up:** the grown-up shows three cards from the last game. The child guesses where the "robot" will end up and checks by walking.
- **In Gearbit:** the **Blocks** tab → **Examples** → **First steps**.
- **Task:** read the blocks together. What will the car do? Show it with a finger on the floor. Press **Run** in the emulator, then on the robot. Did it match? Now change one number: seconds or power.
- **Talk:** a program is commands in order, from top to bottom. Which block runs first?

### 1.6. Traffic light

- **Warm-up:** the "Traffic light" game: red — stand, yellow — get ready, green — go.
- **In Gearbit:** the **Traffic light** example.
- **Task:** change the order of the colors or the time. Make your own "flasher": two colors taking turns.
- **If it's easy:** a traffic light that says "Let's go!" at the end with the "say" block.
- **Talk:** why do we need the "wait" block? What happens without it? Try removing it.

### 1.7. The square and repeating

- **Warm-up:** a dance with repeats: "clap, stomp, turn" — and again, and again. How do you write this shorter? "Repeat 4 times".
- **In Gearbit:** the **Square** example: the "repeat" block.
- **Task:** first guess how many times the robot will turn. Run it. A real robot turns differently on a carpet and on a smooth floor: pick the turn time so the square comes out even.
- **If it's easy:** a triangle (repeat 3 times, a longer turn); two squares in a row.
- **Talk:** why is the program shorter with the "repeat" block?

### 1.8. Celebration: my route

- **Task:** come up with a route, for example taking a "letter" from the sofa to the door. Draw the route in the notebook, build the program, check it in the emulator. Obstacles in the emulator room are drawn with the mouse: press and drag. Then check it on the floor and fix it.
- **Show:** invite the family to the "premiere". Save the program with **Save**.
- **If you want more:** draw a comic about how the letter traveled.
- **Talk:** what did you have to fix? What turned out best?

**After this level the child can:**

- point out the robot's motors, sensors and lights;
- drive with the remote and stop the robot with STOP;
- say what a program of 3–5 blocks will do, and check themselves;
- change a number in a block and see what changed;
- find which command is "wrong" when the robot goes the wrong way.

## Level 2. Ages 8–9: the robot senses

**Goal:** the child reads and builds block programs on their own, uses sensors, loops, "if … else", events and variables, and looks for mistakes step by step.

At this level the rule "Guess — run — figure out — change — make your own" works well. Every lesson starts with a ready-made example: first we guess and take it apart, then change it, and at the end make our own.

### 2.1. The robot's eyes

- **Warm-up:** "hot and cold" with numbers: the grown-up walks to a wall, the child calls out a number from 0 (touching) to 6 (far).
- **In Gearbit:** **Remote** → the **Sensors** card. Bring your hand to the sensor and watch the number.
- **Task:** with a ruler, find at how many centimeters the sensor shows 2. Check what it sees well and what badly: a box, a hand, a glass jar, a chair leg. Write it in the notebook.
- **Talk:** why might the robot miss a chair leg? What does that mean for our programs?

### 2.2. Smart brake

- **Warm-up:** "Walk until you hear a clap": the child walks, the grown-up claps — the child stops.
- **In Gearbit:** the **Smart brake** example: the "wait until" block.
- **Task:** guess where the robot will stop. Run it in the emulator and draw a wall. Make the robot brake farther from the wall. Then make it turn red when it stops.
- **If it's easy:** after stopping, back up a little and say "Phew!".
- **Talk:** what happens if there's no wall at all? How can you check that safely?

### 2.3. Explorer: if … else

- **Warm-up:** "If I raise my hand — jump, else — clap". Then the child makes up their own rule.
- **In Gearbit:** the **Explorer** example: "if … else" inside "forever".
- **Task:** find where the robot decides where to go. Draw a maze in the emulator with the mouse. Make the robot turn the other way.
- **If it's easy:** change the light color while turning.
- **Talk:** why do we need "forever" here? What would happen with a plain "repeat 10"?

### 2.4. Careful driver: events

- **Warm-up:** "When the bell rings — sit down". The child is busy with something else but reacts to the bell right away.
- **In Gearbit:** the **Careful driver** example: the event "when distance < 2".
- **Task:** compare it with **Smart brake**. How is "wait until" different from a "when" event? Change what the robot does when it sees an obstacle.
- **Talk:** why doesn't this program end by itself? (The robot waits for an obstacle until someone presses **Stop**.)

### 2.5. Counting obstacles: variables

- **Warm-up:** a box labeled "claps". Each time the grown-up claps, the child drops a button into it. How many claps were there? The box is a variable: it has a name and a value that changes.
- **In Gearbit:** the **Counting obstacles** example. Tick the box next to the variable in the palette: its value shows in the **Variables** card.
- **Task:** guess what the count will show after three obstacles. Make the robot say "Record!" and stop at the fifth obstacle.
- **Talk:** what in our life is like a variable? (A game score, age, temperature.)

### 2.6. Tilt me

- **Warm-up:** "statues": freeze leaning forward, backward, to the side.
- **In Gearbit:** the **Tilt me** example. Only robots with the new firmware have a gyroscope. Without it, the **Tilt** buttons under the emulator room show a tilt.
- **Task:** come up with your own color and phrase for each tilt. While the robot is in your hands, the program changes only lights and captions, no motors: the wheels can pinch fingers.
- **Talk:** where in real life does technology sense a tilt? (A phone rotating its screen, a spirit level, a scooter.)

### 2.7. Robot roulette: randomness

- **Warm-up:** roll a die: a random number is one you can't know in advance.
- **In Gearbit:** **Operators** → "pick random … to …".
- **Task:** the robot stands in the middle, the players sit around it. The robot spins on the spot for a random time from 1 to 3 seconds, stops and says "Your turn!". Whoever its nose points at asks a riddle.
- **If it's easy:** a random light color; the robot counts turns in a variable.
- **Talk:** can you guess who the robot will point at? Why?

### 2.8. Project: a robot helper

We follow the engineering design cycle: **ask → imagine → plan → create → improve**.

- **Pick a task** or invent your own:
  - "Parking": drive into a garage made of a box and stop without touching the wall;
  - "Guard": the robot stands still and flashes red when someone comes close;
  - "Cleaner": drives around the room without bumping into things and counts walls.
- **Plan** in the notebook: a drawing, which sensors and blocks you need.
- **Come up with several solutions,** not just one. Pick the best.
- **Build** it, check it in the emulator, then on the floor. Improve it in 2–3 tries. Write down what you had to fix.
- **Show** the project to the family or a friend. Save it to a file: then it can be opened on another computer.
- **If you want more:** write a short story told by the robot: how it helped.

**After this level the child can:**

- build a program of 5–15 blocks on their own and explain what it does;
- explain the difference between "repeat", "forever" and "wait until";
- use the distance sensor in "if … else" and in an event;
- create a variable and watch its value;
- find a mistake step by step and bring back an earlier version of the program with **History** ([Program history](history.md)).

## Level 3. Ages 10–11: robot engineer

**Goal:** the child runs experiments and records the results, tunes a program by measurements, uses complex conditions, finishes a project following the engineering design cycle, and sees the same program in Python for the first time.

### 3.1. The robot sees the line

- **Warm-up:** draw a thick line on a sheet of paper. A coin is the "robot". The rule: if the coin is on black, move it a little right and forward; if on white, a little left and forward. The child moves the coin by the rule. It ends up following the edge of the line.
- **In Gearbit:** set up the "Down" sensors as in [Line following](line-following.md). In the emulator pick the **Line** floor.
- **Task:** check what the **Sensors** card shows above the paper and above the tape. Write the levels in the notebook.
- **Talk:** why does the sensor see the line better on drawing paper than on a patterned carpet?

### 3.2. Along the line edge: a power experiment

- **In Gearbit:** the **Along the line edge** example: one sensor and a zigzag along the edge.
- **Task:** guess why the robot wiggles. Then an experiment: what is the highest power at which the robot still doesn't lose the line? Change only one number at a time, test each power 3 times and write it in a table.
- **Talk:** why do we change only one number in an experiment? What if you changed two at once?

### 3.3. Following the line with two sensors

- **In Gearbit:** the **Follow the line** example: "if … else" inside "if … else".
- **Task:** draw a table: the left sensor on black or white, the right sensor on black or white. Four cells — four cases. What does the robot do in each? Find the case the program handles worst and improve it.
- **If it's easy:** if both sensors see black, it's a crossing: stop and flash.

### 3.4. Your own track and a race against the clock

- **Task:** lay out your own track with tape. Which turns can the robot take, and which not? How do you fix it: in the program (power, turns) or in the track (a smoother turn)?
- **Race:** the "timer" block from **Sensing** measures the lap time. Improve the program and beat your record. Write the records in the notebook.
- **Talk:** which is faster — driving fast and sometimes losing the line, or driving slower but steadily?

### 3.5. Complex conditions: and, or, not

- **Warm-up:** "Clap if I raise my hand **and** say 'yes'". Then "… **or** …", then "**not** …".
- **Task:** improve **Explorer**. If there's an obstacle both in front and on the right — turn around. If only in front — turn left. Otherwise — forward.
- **If it's easy:** the robot stops if it's tilted or lifted (the "tilted?" block): this is real protection, like in robot vacuums.
- **Talk:** when do you need "and", and when "or"? Think of an example from life.

### 3.6. Robot scientist: measurements

- **Task:** lay a tape measure on the floor. Run "move forward for 1 second" at power 30, 50 and 70. Each power 3 times; write the distance in a table and work out the average.
- Then use the table: how many seconds does it take to drive exactly 50 cm? Check it.
- **Discovery:** with a 60 % power limit, power 70 and 100 give the same as 60. You can see it in the table.
- **Talk:** why does the robot drive a slightly different distance with the same program? (The battery, the floor, slipping.)

### 3.7. Blocks and Python side by side

- **In Gearbit:** open the **Square** example in **Blocks** and on the **Python** tab. Python needs Python from python.org: a grown-up installs it ([Python](python.md)).
- **Task:** put the programs side by side. Find "repeat 4 times" in Python (`for side in range(4):`), "move forward" and "turn". Guess what happens if you change `4` to `3`. Run it.
- **If it's easy:** open **Explorer** in Python and find "if … else" there.
- **Talk:** what is easier in text than in blocks, and what is harder?

### 3.8. Project: robot olympics

- **Pick 2–3 events:** a line race against the clock, reverse parking, bowling (knock down plastic cups), a maze of boxes.
- **Another robot:** build a different model from the kit, for example a tank. Tell Gearbit where its sensors are (the **Sensors** card) and adjust the program.
- **Follow the engineering design cycle:** rules and a drawing go into the notebook, then the program, testing and improving. At the end — a competition with the family and an award ceremony.

**After this level the child can:**

- run an experiment: change one thing, keep the rest, repeat and record;
- tune a program using their own measurements;
- use "and", "or", "not" and the timer;
- figure out how someone else's program works and improve it;
- find familiar block commands in a Python program.

## Level 4. Ages 12+: programmer

**Goal:** the teenager writes programs in Python or C#, reads error messages, splits a program into functions, keeps data in lists and makes a project of their own from idea to presentation.

Start with Python: it's shorter. C# is for those curious about how Gearbit itself is written. The robot commands are the same in both languages: [Python](python.md), [C#](csharp.md).

### 4.1. The first ride in Python

- **In Gearbit:** the **Python** tab → **Examples** → **First ride**.
- **Task:** guess what each line does, run it, change the power and seconds.
- **The "Break it on purpose" game:** remove a colon, write `robot.forwrd`, delete the first line. Each time read what Gearbit says and fix it. Errors are hints, not punishment.

### 4.2. A puzzle of lines

- **Task:** the grown-up copies out an example (for example **Square** or **Explorer**), shuffles the lines and gives them to the teenager. The task is to put them in the right order with the right indentation, then run it.
- **If it's easy:** the puzzle has an extra line that needs to be found.
- **Talk:** how does indentation show which lines are inside the loop?

### 4.3. Loops and conditions as text

- **In Gearbit:** the **Explorer** and **Careful driver** examples in Python.
- **Task:** add a `#` comment to every line in your own words. Then change it: let the robot pick a random turn at an obstacle (`import random`).
- **Talk:** why doesn't `while True:` end by itself? How does STOP stop the program?

### 4.4. Functions: your own commands

- **Task:** write your own command `dance()` — a turn back and forth plus lights — and call it three times. Then a command with a parameter: `square(seconds)` drives a square of the size you need.
- **If it's easy:** a "moves library": several functions and a program that builds a dance from them.
- **Talk:** how is a function like the "repeat" block? How is it different?

### 4.5. A route is data

- **Task:** describe a route as a list and let the robot follow it:

```python
from gearbit import robot, wait

# Route: (command, seconds)
route = [("forward", 2), ("left", 0.6), ("forward", 1)]

for step, seconds in route:
    if step == "forward":
        robot.forward(50, seconds)
    elif step == "left":
        robot.turn_left(40, seconds)
    elif step == "right":
        robot.turn_right(40, seconds)
```

- **If it's easy:** add a "color" command; write the route backward so the robot returns to the start.
- **Talk:** the route changed, but the program didn't. Why is that handy?

### 4.6. Smooth line following

- **In Gearbit:** the **Follow the line** and **Along the line edge** examples in Python.
- **Task:** instead of sharp turns on the spot, use `robot.tank(left, right)`: one wheel spins slower. Pick the powers, time the lap (`import time`, `time.monotonic()`) and put the results in a table.
- **Talk:** the robot keeps comparing where it is and corrects its course. That's feedback. Where else is it used? (A thermostat, an autopilot, ourselves on a bike.)

### 4.7. C#: the same robot in another language

- **In Gearbit:** the **C#** tab, the same example as in Python, for example **Square**.
- **Task:** find the differences: `robot.Forward(50);` instead of `robot.forward(50)`, semicolons, curly braces, variable types. Rewrite your `dance()` function in C#.
- **If it's easy:** for grown-ups and older teens — a program of your own in Visual Studio with the `Gearbit.Client` library ([C#](csharp.md)).

### 4.8. A project of your own

Over 2–4 sessions. The teenager picks the idea; the grown-up helps break it into steps.

- **Ideas:** a guard robot that counts guests; a robot cat that runs away from a hand; a tour guide around the home with stops and captions; a line race with a record table; a game for a younger brother or sister.
- **Steps:** a plan on paper → the simplest version that already works → testing → improvements one at a time.
- **Description:** a short text: what the robot does, how to run it, what didn't work out. Like a real README that programmers write.
- **Presentation:** show it to the family or the class. Even better — teach a younger child: explaining something makes you understand it more deeply.

**After this level the teenager can:**

- write programs in Python (or C#) with loops, conditions and functions;
- read error messages and fix the program on their own;
- keep data in variables and lists;
- run experiments and pick parameters from the results;
- bring a project of their own to a working version and talk about it.

## Bug detective

Every programmer makes mistakes. Finding and fixing a mistake is the main skill, not a punishment. Solve it step by step:

1. **What did I want, and what happened?** Say it aloud in one sentence.
2. **Where did it start going wrong?** Run the program slowly: detach some blocks, add "say" or `print`, put "wait" between commands.
3. **One guess — one change — one check.** Don't change many things at once.
4. **Check the robot, not just the program:** the battery charge, the sensor wires, the sensor place in the **Sensors** card, whether a wheel is rubbing.
5. **Didn't work out in 10 minutes?** Try three different ways, then call a grown-up or take a break. Broke the program? Its earlier version is in **History**.

For the grown-up: don't fix it for the child. Ask: "What did you expect?", "Which block is responsible for that?", "How can we check?". Praise persistence and a good guess, not only the result.

## Tips for grown-ups

- **Learning through play.** According to a LEGO Foundation research review, children learn best when they're having fun, when the new connects to what they already know, when they're absorbed, when they try and improve, and when they do it together with others. Not everything is needed in one lesson, but over several lessons all of it should come up.
- **The child holds the mouse.** Even when you really want to show it yourself. Hint with questions.
- **Follow the interest.** The child likes lights — let them make a garland. Likes racing — let them build tracks. The order of lessons can change.
- **Connect it to life.** Where at home are there programs and sensors? A washing machine, an elevator, automatic doors, a robot vacuum.
- **Praise specifically:** "you found the mistake because you checked step by step", not "well done, you're smart".
- **Screens together.** A lesson with the robot is shared and active: hands, the floor, talking. Agree on screen-time rules in advance. The American Academy of Pediatrics (AAP) offers a family media plan for this.
- **Keep the successes:** program files, photos, the engineer's notebook. In half a year it's nice to look back at where you started.
- **Older and younger together.** The older one is the navigator and teacher, the younger one is the driver.

## Where to find more activities

### LEGO Education lessons

[education.lego.com/lessons](https://education.lego.com/en-us/lessons/) has more than 400 free lesson plans; they open without signing up. The lessons are written for the LEGO SPIKE Essential (grades 1–5) and SPIKE Prime (grades 6–8) sets and their app. They won't work as is, but the ideas carry over to SuperBot easily:

| LEGO | Gearbit and SuperBot |
|---|---|
| Motor | Motors M1 and M2: **Motion** blocks, the **Motors** card |
| Color sensor | A "Down" sensor: black or white |
| Distance sensor | The IR sensor: a level from 0 to 6 |
| Light matrix | Lights and "say" |
| Hub tilt | "tilted?", "when tilted" |

**What to look at:**

- SPIKE Essential, **Happy Traveler**: transportation. You need to get somewhere, and in the last lesson invent your own way. Fits levels 1–2.
- **Crazy Carnival Games**: arcade games, like our robot roulette. Level 2.
- **Quirky Creations**: inventions that solve school problems. Levels 2–3.
- SPIKE Prime with Python:
  - **Playing Games with Simple Conditions** — conditions and tilt;
  - **Testing for Bugs** — how to look for mistakes in hardware and in the program.

  This is level 4.

**What to borrow from how their lessons are built:**

- a story with characters who have a problem;
- two rounds: first come up with several solutions, then build and improve in 2–3 tries;
- "easier" and "harder" for every lesson;
- color self-rating and kind feedback;
- a follow-up: write a story about what the robot did.

LEGO lesson steps follow the 5E model: engage, explore, explain, elaborate, evaluate. They are similar to our five steps.

**Rights.** LEGO materials can be viewed and downloaded for free for non-commercial home use. They have no open license: their texts and pictures may not be copied or redistributed. That's why Gearbit doesn't include them, only links.

### Other free materials

- [CS Unplugged](https://www.csunplugged.org/): computer science games without a computer. Open license CC BY-SA 4.0: you can print and adapt them.
- [Code.org CS Fundamentals](https://code.org/csf): courses A–F for elementary school, including lessons without a computer.
- [Raspberry Pi Foundation projects](https://projects.raspberrypi.org/en/projects): step-by-step Scratch and Python projects. There's no robot in them, but loops, conditions and variables are the same. Good for levels 2–4 between robot lessons.
- [FIRST LEGO League](https://www.firstlegoleague.org/): team robotics competitions for school students. Needs a LEGO set. A good next step for those who enjoyed it.

## Where these ideas come from

- **Marina Bers, Boston College (DevTech, Coding as Another Language)** — seven "powerful ideas" of programming for young children: algorithms, modularity, control structures, representation, hardware and software, the design process, debugging. Coding as a playground, not a playpen. [sites.bc.edu/codingasanotherlanguage](https://sites.bc.edu/codingasanotherlanguage/)
- **Bers and colleagues: emotions and strategies in debugging in early childhood.** [PDF](https://sites.bc.edu/devtech/wp-content/uploads/sites/181/2020/10/ThinkingStrategicallyActingTacticallyTheEmotionsBehindtheCognitiveProcessofDebugginginEarlyChildhood.pdf)
- **Mitchel Resnick, "Lifelong Kindergarten"** (MIT Press, 2017) — the four P's: projects, passion, peers, play; the creative learning spiral: imagine → create → play → share → reflect.
- **Use–Modify–Create:** Lee et al., "Computational thinking for youth in practice", ACM Inroads, 2011. [doi.org/10.1145/1929887.1929902](https://doi.org/10.1145/1929887.1929902)
- **PRIMM** (Predict, Run, Investigate, Modify, Make): Sentance and colleagues, Raspberry Pi Foundation. [Quick read (PDF)](https://static.teachcomputing.org/pedagogy/QR11-PRIMM.pdf)
- **CS Unplugged** — computer science through games without a computer. [csunplugged.org](https://www.csunplugged.org/)
- **Code.org, CS Fundamentals** — courses A–F for elementary school with lessons without a computer. [code.org/csf](https://code.org/csf)
- **CSTA K–12 Computer Science Standards** — what children can do by level: 1A (ages 5–7), 1B (8–11), 2 (11–14). [csteachers.org/k12standards](https://csteachers.org/k12standards/)
- **Engineering is Elementary, the engineering design process** (Museum of Science, Boston): ask, imagine, plan, create, improve. [yes.mos.org](https://yes.mos.org/impact/engineering-design-process)
- **Pair programming** (driver and navigator) for school students: the ETR toolkit. [PDF](https://www.etr.org/default/assets/File/projects/Pair%20Programming%20Toolkit_FINAL%207_30_19.pdf)
- **Parsons problems** — putting a program together from shuffled lines: Ericson et al., ITiCSE 2023. [PDF](https://strathprints.strath.ac.uk/86100/1/Ericson_etal_ITiCSE_2023_Conducting_multi_institutional_studies_of_Parsons_problems.pdf)
- **Blocks and text** — David Weintrop's research: how blocks help with the move to text. [Raspberry Pi Foundation](https://www.raspberrypi.org/blog/block-based-programming-does-it-help-students-learn-research-seminar/)
- **LEGO Foundation, "Learning through play"**: five characteristics of learning through play — joyful, meaningful, actively engaging, iterative, socially interactive (Zosh et al., 2017). [PDF](https://cms.learningthroughplay.com/media/vd5fiurk/what-we-mean-by-learning-through-play.pdf)
- **LEGO Education, lesson plans**: how a lesson is built, "easier" and "harder", self-rating and feedback. [education.lego.com/lessons](https://education.lego.com/en-us/lessons/)
- **AAP, Family Media Plan** — family screen-time rules. [healthychildren.org](https://www.healthychildren.org/English/fmp/Pages/MediaPlan.aspx)
