This editor draws the single line diagram (SLD) of the substations in an SCL file, using a pick and place palette.

It stays as close as possible to IEC 61850-6. Graphical properties of elements and the geometry of the wires of connectivity nodes are stored in the extension namespace `https://openscd.org/SCL/SSD/SLD/v0`, inside `Private` elements of type `OpenSCD-SLD-Layout`, which other tools are required to preserve.

Several Substations can be drawn. The editor can be used together with other plugins that add logical nodes and further functionality.

## Modelling

When drawing an SLD, keep the following requirements in mind:

- Voltage Levels are generally the first item to draw
- Bays must lie within Voltage Levels, and Conducting Equipment within Bays
- Transformers can be placed within Substations, Voltage Levels or Bays (the SCL parent follows the position of the transformer)
- A bus bar is a Bay with a single Connectivity Node, drawn as a thick line
- Each Connectivity Node is drawn as the wires connecting the terminals of the equipment attached to it

The SCL schema does not allow a Substation without a Voltage Level, or a Voltage Level without a Bay, so a schema error is often shown right after adding a Substation or a Voltage Level.

## Mouse and keyboard

Every action that takes two clicks (one to pick something up, one to put it down) can also be done by pressing the left mouse button, dragging, and releasing it where the action should end.
This includes placing new items from the palette, moving and resizing items, drawing connections and moving wires and junctions.

While placing or resizing, a tooltip next to the cursor shows the coordinates or the size, and turns red where the item cannot go.

| Input | Where | Action |
| --- | --- | --- |
| Left click | Palette button | Pick up a new item to place |
| Left drag | Palette button onto the diagram | Place a new item where it is dropped |
| Left click, then left click (or drag) | Item | Move the item |
| `Shift` + left click | Voltage Level, Bay, Transformer or Conducting Equipment | Copy the item |
| Left click | Label or `Text` | Move the label |
| Left click | Resize handle in a corner of a Voltage Level or Bay | Resize from that corner |
| Left click | Unconnected terminal (red or blue dot) | Start a connection |
| Left click | Plain wire | Re-route the wire |
| Left click | Junction dot where plain wires meet | Move the junction |
| Left click | Warning mark (`!`) on a wire | Dismiss the warning |
| Middle click | Conducting Equipment or Transformer | Rotate it a quarter turn (also while placing it) |
| Middle click | Voltage Level or Bay | Resize from the nearest corner |
| Middle click | Bus bar | Resize from the nearest end |
| Middle click | Label | Edit the item in the SCL editing dialog |
| Right click | Any item, label, wire or the background of a Substation | Open the context menu |
| Right click | Terminal circled in yellow | Earth the terminal |
| Left click | Outside an open context menu | Close the menu |
| Right click | Outside an open context menu | Open the context menu of what is under the cursor instead |
| `Esc` | Anywhere | Cancel the ongoing action or close the context menu |
| `Shift` + mouse wheel | Diagram | Scroll horizontally |
| `Ctrl` + `Z` / `Ctrl` + `Y` | Anywhere | Undo / redo (provided by OpenSCD) |

Clicking `x` on the palette also cancels the ongoing action.

## Palette

The palette at the top offers:

- the Conducting Equipment types, a bus bar, a Bay, a Voltage Level and a Substation to add
- the transformers: Two Winding and Three Winding Transformers, Single Winding and Two Winding Auto Transformers, and Single Winding and Two Winding Earthing Transformers
- "Add IED", which lists the IEDs of the file so that they can be placed, and offers to remove references to IEDs that no longer exist
- "Import Bay Typical", which imports a Bay with its IEDs from another file and lets you place it
- "Toggle Labels" and "Toggle IEDs", which show and hide labels and IEDs (hidden labels are also left out of the SVG export)
- "Zoom In" and "Zoom Out"
- `x`, which cancels the ongoing action, and the button that shows this help

## Context menus

Every element in the diagram has a context menu, opened by right-clicking it or its label.
The menu opens with its first action at the cursor. If there is not enough room below the cursor, it ends at the cursor instead, and it only scrolls if it is taller than the window.

| Element | Actions |
| --- | --- |
| Conducting Equipment | Connect, Ground or Detach each terminal; Mirror; Rotate; Copy; Move; Move Label; Add or Remove Text; Edit; Delete |
| Transformer | Mirror; Rotate; Copy; Move; Move Label; Add or Delete Text; Edit; Delete |
| Transformer Winding | Add, Edit or Remove Tap Changer; Edit Winding; Detach Terminals or Neutral Point; and the actions of its Transformer |
| Bay or Voltage Level | Resize; Copy; Move; Move Label; Add or Remove Text; Edit; Delete |
| Bus bar | Resize (from the end nearer to where the menu was opened); Move; Move Label; Add or Remove Text; Edit; Delete |
| Substation (right-click the empty background) | Resize; Download SVG; Edit; Delete |
| Wire | Connect; Re-route; Disconnect |
| IED | Move; Move Label; Edit; Delete IED; Remove from SLD |
| `Text` | Rotate; Move; Edit; Delete; Bold; Remove Formatting; Red; Blue; Reset Color |

"Edit" opens the SCL editing dialog of the element, which is the quickest way to rename it.
For Tap Changers and Transformer Windings, the dialog can only be opened from the context menu.

## Placing

After clicking on the palette, click where the item should go, or drag the palette button onto the diagram.

New Voltage Levels, Bays and bus bars are then sized: click where the opposite corner (or the other end of the bus bar) should go.
Alternatively, press the mouse button at one corner and drag out the item to its full size.
A bus bar runs along the longer of the two directions between its start and its end.

## Moving and copying

Click on an item to pick it up and click again to put it down, or drag it there.
Everything inside a container moves with it.

The wires attached to a moved item follow it: they are routed again around the other items in the way, preferably without crossing other wires, and they are shown as they will be while the item is moved.
Rotating and mirroring an item reroute its wires in the same way.

Where a wire cannot avoid running through other items, it is still kept and drawn through them, and marked with a warning (`!`).
Hovering the mark shows the whole wire; clicking it dismisses the warning.
Undo and redo are helpful to compare the result with what was there before.

Moving an item into another Substation removes its connections to the Substation it came from.

Copy a Voltage Level, Bay, Transformer or Conducting Equipment by holding `Shift` while clicking it, or with "Copy" from its context menu.
Copying a Voltage Level or Bay removes the connections reaching outside of the copy.

Labels and `Text` are moved by left-clicking them.

## Resizing

Voltage Levels and Bays show resize handles in their top left and bottom right corners when hovered.
Click a handle, or middle-click the item near a corner, and then click where that corner should go.

Bus bars can be resized from either end: middle-click the bus bar near the end that should move, or choose "Resize" from its context menu near that end, and click where the end should go.
The other end stays where it is; a bus bar can also be turned this way.
While resizing, the bus bar, its junctions and the wires to it are shown as they will be.
Wires that no longer reach the bus bar, or would run along it, are routed to it again.
Each of them joins it where it can arrive straight on, preferably in line with its equipment, and they spread out along the bus bar rather than sharing a junction.
Wires may join directly opposite each other on the two sides of a bus bar.

The Substation is resized from its context menu or the resize button next to its name, by entering its new width and height.

## Rotating, mirroring and earthing

Middle-click a piece of Conducting Equipment or a transformer to rotate it a quarter turn.
"Mirror" in the context menu mirrors it vertically, as pictured on the palette.

To earth a terminal, right-click it.

## Connecting

Connection points where a `Terminal` can be created are shown as red dots, and those where a `NeutralPoint` can be created (on transformers) as blue dots.
Connection points that can be earthed (by right-clicking them) are circled in yellow; at the default zoom level, this may make red dots look orange and blue dots look green.

Click a connection point to start a connection.
It is routed automatically around the items in the way and follows the cursor.
Clicking an empty spot fixes the route up to there, so that it can be steered; moving the cursor back across the part already fixed takes those corners away again.
The connection is finished by clicking another connection point (shown with a red triangle), a transformer winding, a bus bar or any other wire, which it then joins.

Connections can be drawn from and to transformer windings, but not directly from one transformer to another.

It is generally best to connect the main power flow path first, and single terminal items (earthing switches, voltage transformers) afterwards.

## Wires and junctions

Click a plain wire (not a bus bar) to move it: it is shown running through the cursor, and the next click puts it there, with its ends where they were.
A wire with an end that is not connected to anything is drawn again from the terminal at its other end instead, and only replaced once the new connection has been finished.

Junction dots where three or more plain wires meet can be moved the same way: click the dot and click where it should go.
The wires meeting there are routed to the new place, each arriving from another side.

The context menu of a wire offers:

- "Connect": draws a new wire branching off from the point of the wire nearest to where the menu was opened. It can end on equipment, on a transformer winding, or on a wire of another Connectivity Node, in which case the two Connectivity Nodes are joined into one.
- "Re-route": moves the wire as described above.
- "Disconnect" (naming the equipment, if the wire leads to exactly one): removes the wire together with the terminals at its ends. If this leaves the Connectivity Node in separate pieces, each piece that still connects two or more terminals becomes a Connectivity Node of its own, and anything less is removed.

## Deleting

Items are deleted from their context menu.
Connectivity Nodes that are no longer needed are removed with them.

## Automatic layout

A Substation in which none of the Voltage Levels, Bays or equipment have been placed yet (for example, from a file made by another tool) shows "Lay out automatically" below its name.
This:

- stacks the Voltage Levels one below the other
- draws Bays holding nothing but a Connectivity Node as bus bars across the top of their Voltage Level, and lines up the other Bays below them
- places the equipment of each Bay in rows by how it is connected, starting where the Bay is fed from its bus bars, with a free cell around every item
- places transformers outside of Bays to the right
- routes all connections one by one, the shortest first, connecting everything on a bus bar straight to the bus bar

The result is a single edit that can be undone.

## SVG export

"Download SVG" in the context menu of a Substation, or the download button next to its name, saves an SVG 1.1 drawing that can be used in other software.
Bay and Voltage Level borders are not exported, and neither are labels while they are hidden.

## IEDs

IEDs are placed in the diagram as references within the extension namespace, inside the Substation, Voltage Level or Bay they are placed in.
A reference is still shown after its IED has been removed from the file; the "Add IED" list offers to remove all such references.

## Issues and limitations

Feel free to [file an issue](https://github.com/OMICRONEnergyOSS/oscd-editor-sld/issues) if you would like to see a feature developed or discuss a problem that you've identified.

If you have a question about using the plugin or want to discuss potential for improvement, [start a discussion](https://github.com/OMICRONEnergyOSS/oscd-editor-sld/discussions) on our GitHub repository!

Current limitations are:

- Transformers cannot be connected directly to other transformers
- Wires that cannot avoid other items are drawn through them, and marked with a warning
- Copying a Voltage Level or Bay removes the connections reaching outside of it
- Only three-phase modelling is supported (no single phase)
