<script module lang="ts">
  export const meta = {
    name: "Calendar",
    icon: "calendar",
    description: "Add one-off appointments to your schedule",
    order: 1,
  };
</script>

<script lang="ts">
  import Appointments from "../components/Appointments.svelte";
</script>

<div class="card">
  <h3 style="margin-top:0">My appointments</h3>
  <p class="muted note">
    One-off events added to your schedule on a chosen day. They show at their time on
    the Now screen — tick “All-day event” for a day that replaces the normal schedule.
  </p>
  <Appointments />
</div>

<style>
  .note {
    margin: 0 0 12px;
    font-size: 0.85rem;
  }
</style>
