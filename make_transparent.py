import sys
from PIL import Image
from collections import deque

def make_transparent_floodfill(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    width, height = img.size
    pixels = img.load()
    
    def is_bg(c):
        return c[0] > 235 and c[1] > 235 and c[2] > 235 and c[3] > 0
        
    # Start flood fill from all 4 corners
    queue = deque([(0, 0), (width-1, 0), (0, height-1), (width-1, height-1)])
    visited = [[False]*height for _ in range(width)]
    
    for x, y in queue:
        visited[x][y] = True
        
    while queue:
        x, y = queue.popleft()
        current_color = pixels[x, y]
        
        if is_bg(current_color):
            # Make it transparent
            pixels[x, y] = (255, 255, 255, 0)
            
            # Add neighbors
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height and not visited[nx][ny]:
                    visited[nx][ny] = True
                    queue.append((nx, ny))

    img.save(output_path, "PNG")

if __name__ == "__main__":
    make_transparent_floodfill(sys.argv[1], sys.argv[2])
