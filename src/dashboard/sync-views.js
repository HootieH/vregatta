export function syncViews(map2d, globe3d) {
  // Both views are already centered on boat position via their own update() methods.
  // This module provides a hook for future bidirectional sync.

  // When boat updates, both views center on it (handled by dashboard.js calling
  // map2d.update() and globe3d.update() with the same snapshot).

  // Future: double-click on 2D map to rotate 3D globe to that location.
  return {
    onBoatUpdate(snapshot, positionHistory) {
      if (map2d) map2d.update(snapshot, positionHistory);
      if (globe3d) globe3d.update(snapshot, positionHistory);
      if (map2d && snapshot?.inshoreActive) map2d.updateInshore(snapshot);
    },
  };
}
