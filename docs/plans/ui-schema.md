# UI Schema

Just me noting down some of the things we'll need for the UI, grouped arbitrarily.

## Device Management

Where we add/remove/modify device settings. We should allow per-device serial settings, and persist them to some form of cache directory. We should also let the user set a general/default set of serial settings to use for any device that hasn't been overridden.

We need the ability to add a new device (call list devices with filter arguments, then choose one - currently we filter on search rather than filter in UI - is this the wrong way around?). Add device brings up a modal/dialog with the listing/selection etc to achieve this.

Then we need a list of active devices with the ability to change their settings, and to see key information about them gathered from GET_INFO message. Here we can also remove them if we want.

## Main View

Previously we had all the buttons visible for the main view and had the live plots separate; In the new version I want a handful of popovers that hide a lot of the configuration (such as channel selection, all the rt buffers, timing variables) but we keep a handful of things the same like the colored state button. Ideally these are off to the left and open rightwards, but above and opening down would also be acceptable. Live plots should function as a circular buffer rather than FIFO; the duration of this buffer should be configurable in line with the polling rate of the live frame get message.

## General Settings

Somewhere to set app-wide settings - polling rates, default serial settings, snapshot garbage collection policy, automatically saving snapshots - are the only ones that come to mind for now. UPDATE: This uses tauri stores and a svelte store for the backend logic, is already implemented - we just need to provide a modal for editing them.

## Snapshots

Should be a separate table in a separate view that shows the list with all the relevant metadata for each snapshot. Actions should be available for each snapshot: plot, compare, save, export, delete. Compare requires some matching metadata. Since we aren't yet automatically saving snapshots (since they come from rust first to the UI layer) We need a way to differentiate between snapshots from the current session and snapshots that have been lazy-loaded from disk - and which of these are saved or not. Saving is now what gives something a name rather than just the timestamp.

## Plots and multi-views

Plots should end up with their own dedicated views. We should open one on download of a snapshot automatically for it. How we do these I'm not sure; We could have a tab bar but I don't know how it handles large amounts of stuff? We could do a sidebar with a split of persistent views (main, snapshots etc) and transient views (plots) below in a separate section?. With scrolling, this feels better.

# Some missing parts

We have not yet handled snapshot saving/lazy-loading - this mechanism should be the same as before (gets saved somewhere in appdata as binary blob plus metadata json file, all metadata are grabbed on open and the blobs are lazy loaded when needed). We need to determine how we are writing/reading these.
