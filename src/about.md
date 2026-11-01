The editor is based around a pick and place palette.

It is designed to stay as close as possible to IEC 61850-6, but requires its own extension namespace, `https://openscd.org/SCL/SSD/SLD/v0` for storing graphical properties of elements and the geometric routing of connectivity nodes (within a `Private` element).

It allows drawing of multiple Substations. This can be used together with other plugins to add logical nodes and enhanced functionality.

When drawing an SLD, keep the following modelling requirements in mind:

- Voltage Levels are generally the first item which must be drawn
- Bays must be within Voltage Levels
- Transformers can be placed within Substations, Voltage Levels or Bays (within the SCL file, this is based on their center of rotation)
- Primary system busbars are modelled as a Bay with a single Connectivity Node

There is also a restriction in the SCL schema which means a Substation without a Voltage Level or a Voltage Level a Bay is not valid -- this means there is often a schema error noticed after initialising a Substation or placing a Voltage Level.

## Actions

Pressing `Esc` on the keyboard or clicking `x` on the palette cancels an ongoing action.

Every action that takes two clicks (one to pick something up, one to put it down) can also be done by pressing the left mouse button, dragging, and releasing it where the action should end.
This includes placing new items from the palette, moving and resizing items and drawing connections.

While placing or resizing, a tooltip next to the cursor shows the coordinates or the size, and turns red where the item cannot go.

### Mouse and keyboard reference

| Input | Where | Action |
| --- | --- | --- |
| Left click | Palette button | Pick up a new item to place |
| Left drag | Palette button onto the diagram | Place a new item where it is dropped |
| Left click, then left click | Item | Move the item |
| `Shift` + left click | Voltage Level, Bay, Transformer or Conducting Equipment | Copy the item |
| Left click | Label or `Text` | Move the label |
| Left click | Resize handle in the corner of a Voltage Level or Bay | Resize from that corner |
| Left click | Unconnected terminal (red or blue dot) | Start a connection |
| Left click | Plain connection line | Re-route the connection |
| Left click | Junction dot where plain connection lines meet | Move the junction |
| Left click | Warning mark (`!`) on a connection | Dismiss the warning |
| Middle click | Conducting Equipment or Transformer | Rotate it a quarter turn |
| Middle click | Voltage Level or Bay | Resize from the nearest corner |
| Middle click | Bus bar | Resize from the nearest end |
| Middle click | Label | Edit the item in the SCL editing dialog |
| Right click | Any item, label, connection line or the substation background | Open the context menu |
| Right click | Terminal circled in yellow | Earth the terminal |
| `Esc` | Anywhere | Cancel the ongoing action |
| `Shift` + mouse wheel | Diagram | Scroll horizontally |

### Context Menus

Every element in the diagram has a context menu, opened by right-clicking it or its label:
Conducting Equipment, Transformers and their windings, Bays, bus bars, Voltage Levels, the Substation itself (right-click the empty background), IEDs, `Text` and connection lines.
The context menu of a connection line offers to:

- "Connect": draw a new connection branching off the line where the menu was opened. It can end on equipment, a transformer winding or a line of another connectivity node; in the last case, the two connectivity nodes are joined into one.
- "Re-route" the line.
- "Disconnect" the line (naming the equipment if it leads to exactly one piece of equipment): the line is removed together with the terminals at its ends. If this leaves the connectivity node in separate pieces, each piece that still connects two or more terminals becomes a connectivity node of its own; anything less is removed.

The SCL editing dialog of an item can be opened from its context menu ("Edit"), or directly by middle-clicking its label.
This is especially useful for renaming items quickly.
For Tap Changers and Transformer Windings, this must be done by using the context menu.

### Placing

After clicking on the palette, items can be placed by clicking where they should go, or by dragging the palette button onto the diagram.
During placing, a middle click rotates equipment and transformers.

New Voltage Levels, Bays and bus bars are sized after placing them: either click where the opposite corner (or the other end of the bus bar) should go, or press the mouse button at one corner and drag out the item to its full size.
A bus bar runs along the longer of the two directions between the start and the end.

### Resizing

Voltage Levels and Bays show resize handles in their top left and bottom right corners when hovered.
Click a handle, or middle-click the item near a corner, and then click where that corner should go.

Bus bars are resized from either end: middle-click the bus bar near the end that should move, or choose "Resize" from its context menu near that end, and click where the end should go.
The other end stays where it is; a bus bar can also be turned this way.
While resizing, the bus bar and the connections to it are shown as they will be.
Connections that no longer reach the bus bar, or would run along it, are routed to it again.
Each of them joins it where it can arrive straight on, preferably in line with its equipment, and they spread out along the bus bar rather than sharing a junction.
Connections may join directly opposite each other on the two sides of a bus bar.

The Substation is resized from its context menu or the resize button next to its name.

### Earthing

To earth a terminal, right-click on it.

### Rotating and Mirroring

To rotate a piece of Conducting Equipment or a transformer, middle-click on it.

To mirror, right-click and select the "Mirror" option.
Mirroring only works in the vertical dimension as pictured on the palette.

Connections follow the terminals they are attached to.

### Connecting

Connection points where a `Terminal` can be created are indicated by red dots.
Connection points where a `NeutralPoint` can be created (on transformers) are indicated by blue dots.
Connection points that can be earthed (by right clicking them) are circled in yellow. At the default zoom level, this may make red dots appear orange and blue dots appear green.

Start a connection by clicking on a connection point.
The connection is routed automatically around the items in the way and follows the cursor.
Clicking on an empty spot fixes the route up to there, so that it can be steered; moving the cursor back across the part already fixed takes those corners away again.
The connection is finished by clicking on another connection point (shown with a red triangle), on a transformer winding, on a bus bar or on any other connection line, which it then joins.

Connections can be drawn from transformer windings and to them; transformers cannot be connected directly to other transformers.

Generally it is best to connect the main "power flow" path first and then connect single terminal items (Earthing Switches, Voltage Transformers) subsequently otherwise it is possible to not have any red terminals left to connect to.

### Re-routing connections

Clicking on a plain connection line (not a bus bar) lets you move it: it is shown running through the cursor, and the next click puts it there.
Its ends stay where they are.

Junction dots where three or more plain connection lines meet can be moved the same way: click the dot and click where it should go. The lines meeting there are routed to the new place, each arriving from another side.

A connection line with an end that is not connected to anything is drawn again from the terminal at its other end instead, and only replaced once the new connection has been finished.

### Moving

Click on an item to pick it up and click again to put it down, or drag it there.
Its connections are routed again automatically to follow it, around the other items in the way and preferably without crossing other connections.
While moving, the connections are shown as they will be.

Where a connection cannot avoid running through other items, it is still kept and drawn through them, and marked with a warning (`!`).
Hovering the mark shows the whole connection; clicking it dismisses the warning.
It can be helpful to use undo (Ctrl+Z) and redo (Ctrl+Y) to compare the result with what was there before.

Moving an item into another Substation removes its connections to the Substation it came from.

Labels and `Text` can be moved by left-clicking on them.

### Copying

Copy a Voltage Level, Bay, Transformer, or Conducting Equipment by holding `Shift` while clicking it or by selecting "Copy" from the context menu.

It can be useful to scroll horizontally by holding down `Shift` on the keyboard while using the mouse wheel.

Copying Voltage Levels or Bays results in the removal of any connectivity which reaches outside of the copied element.

### Deleting

Items are deleted from their context menu.
When an item is deleted, any unnecessary Connectivity Nodes are removed.

## Other Features

### Zoom

The "Zoom In" and "Zoom Out" buttons on the palette change the size of the drawing.

### Hide Labels

A "Toggle Labels" button on the palette (next to the zoom buttons) turns labels on and off to allow display of only the SLD symbols.

This also affects the SVG export.

### SVG Export

"Download SVG" in the context menu of a Substation, or the download button next to its name, saves an SVG 1.1 export which can be readily used in other software. Bay and Voltage Level borders and labels are not exported.

### Transformers

The palette offers these transformers:

- Two Winding Transformer
- Three Winding Transformer
- Single Winding and Two Winding Auto Transformers
- Single Winding and Two Winding Earthing Transformers

Tap Changers are added to and removed from a winding using its context menu.

### IEDs

Items representing IEDs are placed within the extension namespace and within
the relevant Substation, VoltageLevel, or Bay element.
These items will be shown on the drawing even if the corresponding IED has
been removed.
The "Add IED" button on the palette opens a list of the IEDs in the file, from which they can be placed.
"Import Bay Typical" on the palette imports a bay together with its IEDs from another file.
There is an option within the IED menu to remove all unmatched IEDs.
The "Toggle IEDs" button shows and hides them.

## Issues and Limitations

Feel free to [file an issue](https://github.com/OMICRONEnergyOSS/oscd-editor-sld/issues) if you would like to see a feature developed or discuss a problem that you've identified.

If you have a question about using the plugin or want to discuss potential for improvement, [start a discussion](https://github.com/OMICRONEnergyOSS/oscd-editor-sld/discussions) on our GitHub repository!

Current limitations are:

- Power Transformers cannot be connected directly to other Power Transformers
- Connections that cannot avoid other items are drawn through them and marked with a warning
- Copying Voltage Levels and Bays results in a loss of connections of the same Connectivity Node
- Only 3 phase functionality is provided (no single phase modelling)
