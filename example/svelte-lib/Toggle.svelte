<script>
  let on = false;
</script>

<button on:click={() => (on = !on)}>
  {on ? 'ON' : 'OFF'}
</button>

<p>The toggle is currently <strong>{on ? 'enabled' : 'disabled'}</strong>.</p>

<style>
  button {
    padding: 0.25rem 1rem;
    cursor: pointer;
    font-weight: bold;
    border-radius: 4px;
  }
</style>
