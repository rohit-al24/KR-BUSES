import javax.swing.*;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class WeatherApi extends JFrame {
	private final String apiKey;
	private final JTextField cityField;
	private final JButton fetchButton;
	private final JTextArea resultArea;
	private final JLabel bigTempLabel;

	public WeatherApi(String apiKey) {
		this.apiKey = apiKey;

		setTitle("Weather App");
		setSize(700, 500);
		setMinimumSize(new Dimension(600, 400));
		setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
		setLocationRelativeTo(null);

		// Header panel for college and department
		JPanel headerPanel = new JPanel();
		headerPanel.setLayout(new BoxLayout(headerPanel, BoxLayout.Y_AXIS));
		headerPanel.setBackground(new Color(230, 240, 255));
		JLabel collegeLabel = new JLabel("K. Ramakrishnan College of Technology");
		collegeLabel.setFont(new Font("Segoe UI", Font.BOLD, 34));
		collegeLabel.setAlignmentX(Component.CENTER_ALIGNMENT);
		collegeLabel.setForeground(new Color(0, 51, 102));
		JLabel deptLabel = new JLabel("Department of Artificial Intelligence and Machine Learning");
		deptLabel.setFont(new Font("Segoe UI", Font.PLAIN, 26));
		deptLabel.setAlignmentX(Component.CENTER_ALIGNMENT);
		deptLabel.setForeground(new Color(0, 102, 153));
		headerPanel.add(Box.createVerticalStrut(18));
		headerPanel.add(collegeLabel);
		headerPanel.add(Box.createVerticalStrut(6));
		headerPanel.add(deptLabel);
		headerPanel.add(Box.createVerticalStrut(18));

		// App name below department, smaller
		JLabel appLabel = new JLabel("Batch 2");
		appLabel.setFont(new Font("Segoe UI", Font.BOLD | Font.ITALIC, 20));
		appLabel.setAlignmentX(Component.CENTER_ALIGNMENT);
		appLabel.setForeground(new Color(51, 51, 51));
		headerPanel.add(appLabel);
		headerPanel.add(Box.createVerticalStrut(10));
		// Input panel
		JPanel inputPanel = new JPanel();
		inputPanel.setBackground(new Color(245, 250, 255));
		inputPanel.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));
		JLabel cityLabel = new JLabel("City:");
		cityLabel.setFont(new Font("Segoe UI", Font.BOLD, 18));
		cityField = new JTextField(20);
		cityField.setFont(new Font("Segoe UI", Font.PLAIN, 18));
		fetchButton = new JButton("Get Weather");
		fetchButton.setFont(new Font("Segoe UI", Font.BOLD, 18));
		fetchButton.setBackground(new Color(0, 102, 204));
		fetchButton.setForeground(Color.WHITE);
		fetchButton.setFocusPainted(false);
		fetchButton.setBorder(BorderFactory.createCompoundBorder(
			BorderFactory.createLineBorder(new Color(0, 102, 204)),
			BorderFactory.createEmptyBorder(5, 15, 5, 15)));
		inputPanel.add(cityLabel);
		inputPanel.add(cityField);
		inputPanel.add(fetchButton);

		// Main content panel with BorderLayout
		JPanel mainPanel = new JPanel(new BorderLayout(0, 0));
		mainPanel.setBackground(new Color(245, 250, 255));

		// Stack headerPanel and inputPanel vertically in the NORTH
		JPanel northPanel = new JPanel();
		northPanel.setLayout(new BoxLayout(northPanel, BoxLayout.Y_AXIS));
		northPanel.setBackground(new Color(230, 240, 255));
		northPanel.add(headerPanel);
		// Center inputPanel horizontally with padding
		JPanel inputWrapper = new JPanel();
		inputWrapper.setBackground(new Color(245, 250, 255));
		inputWrapper.setLayout(new BoxLayout(inputWrapper, BoxLayout.X_AXIS));
		inputWrapper.setBorder(BorderFactory.createEmptyBorder(10, 0, 10, 0));
		inputWrapper.add(Box.createHorizontalGlue());
		inputWrapper.add(inputPanel);
		inputWrapper.add(Box.createHorizontalGlue());
		northPanel.add(inputWrapper);
		mainPanel.add(northPanel, BorderLayout.NORTH);

		// Result area in CENTER with big temperature on right
		JPanel resultPanel = new JPanel(new BorderLayout());
		resultPanel.setBackground(new Color(255, 255, 245));

		// Left: details
		resultArea = new JTextArea(12, 40);
		resultArea.setFont(new Font("Consolas", Font.PLAIN, 20));
		resultArea.setEditable(false);
		resultArea.setLineWrap(true);
		resultArea.setWrapStyleWord(true);
		resultArea.setMargin(new Insets(18, 18, 18, 18));
		resultArea.setBackground(new Color(255, 255, 245));
		JScrollPane scrollPane = new JScrollPane(resultArea);
		scrollPane.setBorder(BorderFactory.createTitledBorder(
			BorderFactory.createLineBorder(new Color(0, 102, 204), 2),
			"Weather Info",
			0, 0,
			new Font("Segoe UI", Font.BOLD, 18),
			new Color(0, 102, 204)
		));
		resultPanel.add(scrollPane, BorderLayout.CENTER);

		// Right: big temperature label
	bigTempLabel = new JLabel("");
	bigTempLabel.setFont(new Font("Segoe UI", Font.BOLD, 64));
	bigTempLabel.setForeground(new Color(0, 102, 204));
	bigTempLabel.setHorizontalAlignment(SwingConstants.CENTER);
	bigTempLabel.setVerticalAlignment(SwingConstants.CENTER);
	bigTempLabel.setPreferredSize(new Dimension(180, 180));
	resultPanel.add(bigTempLabel, BorderLayout.EAST);

		mainPanel.add(resultPanel, BorderLayout.CENTER);

		setContentPane(mainPanel);

		fetchButton.addActionListener(new ActionListener() {
			@Override
			public void actionPerformed(ActionEvent e) {
				String city = cityField.getText().trim();
				if (!city.isEmpty()) {
					fetchWeather(city);
				} else {
					resultArea.setText("Please enter a city name.");
				}
			}
		});
	}

	private void fetchWeather(String city) {
		try {
			String json = getWeather(city);
			String[] prettyAndTemp = parseWeatherJsonWithTemp(json);
			resultArea.setText(prettyAndTemp[0]);
			// Set big temperature
			String temp = prettyAndTemp[1];
			if (temp != null && !temp.isEmpty()) {
				try {
					int tempInt = (int)Math.round(Double.parseDouble(temp));
					bigTempLabel.setText(tempInt + "°C");
				} catch (Exception e) {
					bigTempLabel.setText("");
				}
			} else {
				bigTempLabel.setText("");
			}
		} catch (Exception ex) {
			resultArea.setText("Error fetching weather: " + ex.getMessage());
			bigTempLabel.setText("");
		}
	}

	// Parse JSON and return [details, temp]
	private String[] parseWeatherJsonWithTemp(String json) {
		if (json == null || !json.trim().startsWith("{")) return new String[]{json, ""};
		try {
			String city = extract(json, "\"name\":\"", "\"");
			String country = extract(json, "\"country\":\"", "\"");
			String temp = extract(json, "\"temp\":", ",");
			String feels = extract(json, "\"feels_like\":", ",");
			// Extract description from first element of weather array
			String desc = "";
			int weatherArr = json.indexOf("\"weather\":[");
			if (weatherArr != -1) {
				int descStart = json.indexOf("\"description\":\"", weatherArr);
				if (descStart != -1) {
					descStart += "\"description\":\"".length();
					int descEnd = json.indexOf("\"", descStart);
					if (descEnd != -1) {
						desc = json.substring(descStart, descEnd);
					}
				}
			}
			String humidity = extract(json, "\"humidity\":", ",");
			String wind = extract(json, "\"speed\":", ",");
			StringBuilder sb = new StringBuilder();
			sb.append("City: ").append(city);
			if (country != null && !country.isEmpty()) sb.append(", ").append(country);
			sb.append("\nTemperature: ").append(temp).append(" °C");
			//sb.append("\nFeels Like: ").append(feels).append(" °C");
			sb.append("\nWeather Condition: ").append(desc);
			sb.append("\nHumidity: ").append(humidity).append("%");
			sb.append("\nWind Speed: ").append(wind).append(" m/s");
			return new String[]{sb.toString(), temp != null ? temp.trim() : ""};
		} catch (Exception e) {
			return new String[]{json, ""};
		}
	}

	// Helper to extract value between a prefix and a suffix
	private String extract(String json, String prefix, String suffix) {
		try {
			int start = json.indexOf(prefix);
			if (start == -1) return "";
			start += prefix.length();
			int end = json.indexOf(suffix, start);
			if (end == -1) end = json.length();
			return json.substring(start, end).replaceAll("\\\\", "");
		} catch (Exception e) {
			return "";
		}
	}

	public String getWeather(String city) throws Exception {
		String urlString = String.format(
			"https://api.openweathermap.org/data/2.5/weather?q=%s&appid=%s&units=metric",
			city, apiKey
		);
		URL url = new URL(urlString);
		HttpURLConnection conn = (HttpURLConnection) url.openConnection();
		conn.setRequestMethod("GET");

		int responseCode = conn.getResponseCode();
		if (responseCode == 200) {
			BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
			String inputLine;
			StringBuilder content = new StringBuilder();
			while ((inputLine = in.readLine()) != null) {
				content.append(inputLine);
			}
			in.close();
			// For simplicity, just return the raw JSON. You can parse it for a nicer output.
			return content.toString();
		} else {
			return "Failed to fetch weather data. HTTP code: " + responseCode;
		}
	}

	public static void main(String[] args) {
		SwingUtilities.invokeLater(() -> {
			new WeatherApi("b44dc9b53167ac178aed76ad780400c2").setVisible(true);
		});
	}
}
